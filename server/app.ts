import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, Notice, ServerToClientEvents, SessionInfo } from '../shared/types';
import { SnapshotStore } from './persistence';
import { KeyedLimiter, TokenBucket } from './rateLimit';
import { RoomStore, type Result, type Room } from './rooms';
import { roomView } from './views';

export interface GameServerOptions {
  port?: number;
  host?: string;
  /** Directory for the room snapshot; null disables persistence. */
  dataDir?: string | null;
  /** Built client to serve (dist/client); null to serve nothing but sockets. */
  staticDir?: string | null;
  allowedOrigins?: string[];
  trustProxy?: boolean;
  sweepIntervalMs?: number;
  store?: RoomStore;
  quiet?: boolean;
}

interface SocketData {
  code?: string;
  playerId?: string;
  bucket: TokenBucket;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Room codes live in the URL; do not leak them to other sites.
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function makeStaticHandler(staticDir: string | null) {
  const root = staticDir ? resolve(staticDir) : null;
  const hasClient = root !== null && existsSync(join(root, 'index.html'));
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (!hasClient || !root) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Client build not found. Run "npm run build" or use "npm run dev".');
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = normalize(join(root, pathname));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    const isAsset = extname(pathname) !== '';
    if (!isAsset || !existsSync(file) || !statSync(file).isFile()) {
      if (isAsset) {
        res.writeHead(404).end();
        return;
      }
      file = join(root, 'index.html'); // SPA routes such as /r/ABC123
    }
    const immutable = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  };
}

/**
 * Client IP as seen by the trusted reverse proxy in front of us: the last
 * X-Forwarded-For entry. Earlier entries come from the client and can be forged,
 * so using the first one would let anyone dodge the per-IP rate limits.
 */
export function forwardedClientIp(header: string | string[] | undefined): string | null {
  const entries = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return entries.at(-1) ?? null;
}

export interface GameServer {
  port: number;
  store: RoomStore;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  close(): Promise<void>;
}

export async function startGameServer(opts: GameServerOptions = {}): Promise<GameServer> {
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[server]', ...a);
  const store = opts.store ?? new RoomStore();
  const snapshots = opts.dataDir ? new SnapshotStore(opts.dataDir) : null;
  if (snapshots && store.rooms.size === 0) {
    for (const room of snapshots.load()) store.rooms.set(room.code, room);
    if (store.rooms.size) log(`restored ${store.rooms.size} room(s) from snapshot`);
  }

  const httpServer = createServer(makeStaticHandler(opts.staticDir ?? null));
  const allowed = new Set(opts.allowedOrigins ?? []);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20000,
    pingTimeout: 20000,
    allowRequest: (req, callback) => {
      // Browsers always send Origin; accept same-origin or explicitly allowed origins.
      // Non-browser clients (tests, CLI) send none. Auth itself is the session token.
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      try {
        const o = new URL(origin);
        callback(null, o.host === req.headers.host || allowed.has(origin));
      } catch {
        callback(null, false);
      }
    },
  });

  const ipLimiter = new KeyedLimiter(30, 0.5); // room create/join/resume: burst 30, then 1 per 2s
  const socketOf = new Map<string, string>(); // `${code}:${playerId}` → socket id
  const sessionKey = (code: string, playerId: string) => `${code}:${playerId}`;
  const persist = () => snapshots?.schedule(() => store.rooms.values());

  function broadcast(room: Room, notices: Notice[] = []): void {
    for (const p of room.players) {
      const sid = socketOf.get(sessionKey(room.code, p.id));
      if (sid) io.to(sid).emit('room:state', roomView(room, p.id));
    }
    for (const n of notices) io.to(`room:${room.code}`).emit('room:notice', n);
    persist();
  }

  function endSession(code: string, playerId: string, reason: 'kicked' | 'replaced' | 'room_closed'): void {
    const key = sessionKey(code, playerId);
    const sid = socketOf.get(key);
    socketOf.delete(key);
    const sock = sid ? io.sockets.sockets.get(sid) : undefined;
    if (sock) {
      sock.emit('session:ended', reason);
      sock.leave(`room:${code}`);
      sock.data.code = undefined;
      sock.data.playerId = undefined;
    }
  }

  function unbind(socket: GameSocket): void {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return;
    socket.data.code = undefined;
    socket.data.playerId = undefined;
    socket.leave(`room:${code}`);
    const key = sessionKey(code, playerId);
    if (socketOf.get(key) !== socket.id) return; // a newer socket owns this player
    socketOf.delete(key);
    const room = store.get(code);
    if (room) {
      store.setConnected(room, playerId, false);
      broadcast(room);
    }
  }

  function bind(socket: GameSocket, room: Room, playerId: string): void {
    if (socket.data.code !== room.code || socket.data.playerId !== playerId) unbind(socket);
    const key = sessionKey(room.code, playerId);
    const previous = socketOf.get(key);
    if (previous && previous !== socket.id) endSession(room.code, playerId, 'replaced');
    socketOf.set(key, socket.id);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    socket.join(`room:${room.code}`);
    store.setConnected(room, playerId, true);
  }

  const clientIp = (socket: GameSocket): string => {
    if (opts.trustProxy) {
      const forwarded = forwardedClientIp(socket.handshake.headers['x-forwarded-for']);
      if (forwarded) return forwarded;
    }
    return socket.handshake.address;
  };

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as GameSocket;
    socket.data.bucket = new TokenBucket(20, 4);

    // Generic wrapper: rate limit, payload shape guard, exception safety, ack.
    const handle = <T>(
      event: keyof ClientToServerEvents,
      fn: (payload: Record<string, unknown>) => Ack<T>,
    ) => {
      socket.on(event as never, ((payload: unknown, cb: unknown) => {
        const reply = typeof cb === 'function' ? (cb as (a: Ack<T>) => void) : () => {};
        if (!socket.data.bucket.take()) return reply({ ok: false, error: 'RATE_LIMITED' });
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          return reply({ ok: false, error: 'BAD_REQUEST' });
        }
        try {
          reply(fn(payload as Record<string, unknown>));
        } catch (e) {
          console.error(`[server] ${String(event)} failed:`, (e as Error).message);
          reply({ ok: false, error: 'SERVER_ERROR' });
        }
      }) as never);
    };

    // Actions that need an authenticated seat in a room.
    const action = (
      event: keyof ClientToServerEvents,
      fn: (room: Room, playerId: string, p: Record<string, unknown>) => Result<unknown>,
      after?: (room: Room, value: unknown) => void,
    ) =>
      handle(event, (p) => {
        const { code, playerId } = socket.data;
        if (!code || !playerId) return { ok: false, error: 'NOT_IN_ROOM' };
        const room = store.get(code);
        if (!room || socketOf.get(sessionKey(code, playerId)) !== socket.id || !room.players.some((x) => x.id === playerId)) {
          return { ok: false, error: 'NOT_IN_ROOM' };
        }
        const res = fn(room, playerId, p);
        if (!res.ok) return { ok: false, error: res.error, detail: res.detail };
        after?.(room, res.value);
        if (store.rooms.has(room.code)) broadcast(room, res.notices);
        return { ok: true, data: undefined };
      });

    const sessionReply = (room: Room, playerId: string, token: string): Ack<SessionInfo> => ({
      ok: true,
      data: { code: room.code, playerId, token },
    });

    handle<SessionInfo>('room:create', (p) => {
      if (!ipLimiter.take(clientIp(socket), 3)) return { ok: false, error: 'RATE_LIMITED' };
      const res = store.create(p.name, p.language);
      if (!res.ok) return res;
      const { room, player, token } = res.value;
      bind(socket, room, player.id);
      broadcast(room);
      log(`room ${room.code} created`);
      return sessionReply(room, player.id, token);
    });

    handle<SessionInfo>('room:join', (p) => {
      if (!ipLimiter.take(clientIp(socket))) return { ok: false, error: 'RATE_LIMITED' };
      const res = store.join(p.code, p.name);
      if (!res.ok) return res;
      const { room, player, token } = res.value;
      bind(socket, room, player.id);
      broadcast(room);
      return sessionReply(room, player.id, token);
    });

    handle<SessionInfo>('room:resume', (p) => {
      if (!ipLimiter.take(clientIp(socket), 0.5)) return { ok: false, error: 'RATE_LIMITED' };
      const res = store.resume(p.code, p.token);
      if (!res.ok) return res;
      const { room, player } = res.value;
      bind(socket, room, player.id);
      broadcast(room); // fresh, newly authorised snapshot for this client and presence for others
      return sessionReply(room, player.id, p.token as string);
    });

    handle('room:leave', () => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return { ok: true, data: undefined };
      const room = store.get(code);
      socketOf.delete(sessionKey(code, playerId));
      socket.leave(`room:${code}`);
      socket.data.code = undefined;
      socket.data.playerId = undefined;
      if (!room) return { ok: true, data: undefined };
      const res = store.leave(room, playerId);
      if (res.ok && !res.value.roomClosed) broadcast(room, res.notices);
      if (res.ok && res.value.roomClosed) persist();
      return { ok: true, data: undefined };
    });

    const seat = (v: unknown) => (v === undefined ? null : v) as never;
    action('lobby:choose', (room, id, p) => store.choose(room, id, seat(p.team), seat(p.role)));
    action('host:assign', (room, id, p) => store.assign(room, id, p.playerId, seat(p.team), seat(p.role)));
    action('host:settings', (room, id, p) => store.updateSettings(room, id, p));
    action('host:transfer', (room, id, p) => store.transferHost(room, id, p.playerId));
    action('host:shuffle', (room, id) => store.shuffleTeams(room, id));
    action(
      'host:kick',
      (room, id, p) => store.kick(room, id, p.playerId),
      (room, value) => endSession(room.code, (value as { kickedId: string }).kickedId, 'kicked'),
    );
    action('game:start', (room, id) => store.start(room, id));
    action('game:rematch', (room, id) => store.start(room, id));
    action('game:toLobby', (room, id) => store.backToLobby(room, id));
    action('game:clue', (room, id, p) => store.clue(room, id, p.word, p.count));
    action('game:guess', (room, id, p) => store.guess(room, id, p.index, p.clueId));
    action('game:endTurn', (room, id, p) => store.endTurn(room, id, p.clueId));
    action('chat:send', (room, id, p) => store.chat(room, id, p.text));
    action('player:profile', (room, id, p) => store.profile(room, id, p));
    action('team:rename', (room, id, p) => store.renameTeam(room, id, p.team, p.name));
    action('game:mark', (room, id, p) => store.mark(room, id, p.index, p.clueId));
    action('intro:begin', (room, id) => store.beginIntro(room, id));
    action('intro:present', (room, id, p) => store.presentIntro(room, id, p.playerId));
    action('intro:vote', (room, id, p) => store.voteIntro(room, id, p.value));
    action('intro:finish', (room, id) => store.finishIntro(room, id));
    action('intro:back', (room, id) => store.introBack(room, id));
    action('intro:end', (room, id) => store.endIntro(room, id));

    socket.on('disconnect', () => unbind(socket));
  });

  const sweepTimer = setInterval(() => {
    const { changed, removed } = store.sweep({
      hostGraceMs: 90_000,
      idleTtlMs: 6 * 60 * 60_000,
      maxAgeMs: 48 * 60 * 60_000,
    });
    for (const room of changed) broadcast(room);
    for (const code of removed) {
      for (const key of [...socketOf.keys()]) if (key.startsWith(`${code}:`)) socketOf.delete(key);
    }
    if (removed.length) {
      log(`expired ${removed.length} room(s)`);
      persist();
    }
    ipLimiter.prune(10 * 60_000);
  }, opts.sweepIntervalMs ?? 60_000);
  sweepTimer.unref();

  await new Promise<void>((resolveListen) => httpServer.listen(opts.port ?? 0, opts.host, resolveListen));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    port,
    store,
    io,
    close: async () => {
      clearInterval(sweepTimer);
      snapshots?.flush(store.rooms.values());
      await new Promise<void>((r) => io.close(() => r()));
    },
  };
}
