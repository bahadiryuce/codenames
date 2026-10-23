import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startGameServer, type GameServer } from '../server/app';
import { RoomStore } from '../server/rooms';
import type { Ack, ClientToServerEvents, Identity, Notice, RoomView, ServerToClientEvents, SessionInfo, Team } from '../shared/types';
import { seeded } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Client {
  socket: ClientSocket;
  states: RoomView[];
  notices: Notice[];
  ended: string[];
  session?: SessionInfo;
  call<T = undefined>(event: keyof ClientToServerEvents, payload?: object): Promise<Ack<T>>;
  last(): RoomView;
  waitFor(pred: (v: RoomView) => boolean, ms?: number): Promise<RoomView>;
}

let server: GameServer;
const clients: Client[] = [];

async function client(): Promise<Client> {
  const socket: ClientSocket = connect(`http://localhost:${server.port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c: Client = {
    socket,
    states: [],
    notices: [],
    ended: [],
    call: (event, payload = {}) =>
      new Promise((resolve) => (socket.emit as (...a: unknown[]) => void)(event, payload, resolve)),
    last: () => c.states[c.states.length - 1],
    waitFor: (pred, ms = 3000) =>
      new Promise((resolve, reject) => {
        const found = c.states.find(pred);
        if (found && pred(c.last())) return resolve(c.last());
        const timer = setTimeout(() => reject(new Error('timed out waiting for state')), ms);
        const onState = (v: RoomView) => {
          if (pred(v)) {
            clearTimeout(timer);
            socket.off('room:state', onState);
            resolve(v);
          }
        };
        socket.on('room:state', onState);
      }),
  };
  socket.on('room:state', (v) => c.states.push(v));
  socket.on('room:notice', (n) => c.notices.push(n));
  socket.on('session:ended', (r) => c.ended.push(r));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  clients.push(c);
  return c;
}

async function ok<T>(p: Promise<Ack<T>>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.data;
}

const settle = () => new Promise((r) => setTimeout(r, 60));

/** Host + 3 players seated: red spymaster/operative, blue spymaster/operative, plus a spectator. */
async function seatedRoom() {
  const host = await client();
  const s = await ok(host.call<SessionInfo>('room:create', { name: 'Ada', language: 'tr' }));
  host.session = s;
  const names = ['Bora', 'Cem', 'Deniz', 'Ece'];
  const [b, c, d, e] = await Promise.all(names.map(() => client()));
  for (const [cl, name] of [[b, 'Bora'], [c, 'Cem'], [d, 'Deniz'], [e, 'Ece']] as const) {
    cl.session = await ok(cl.call<SessionInfo>('room:join', { code: s.code, name }));
  }
  await ok(host.call('lobby:choose', { team: 'red', role: 'spymaster' }));
  await ok(b.call('lobby:choose', { team: 'red', role: 'operative' }));
  await ok(c.call('lobby:choose', { team: 'blue', role: 'spymaster' }));
  await ok(d.call('lobby:choose', { team: 'blue', role: 'operative' }));
  await settle();
  return { code: s.code, redSpy: host, redOp: b, blueSpy: c, blueOp: d, spectator: e, all: [host, b, c, d, e] };
}

function assertNoHiddenIdentities(view: RoomView) {
  if (!view.match) return;
  if (view.match.phase === 'finished') return;
  expect(view.match.visibility).toBe('public');
  for (const card of view.match.cards) {
    if (!card.revealed) expect(card.identity).toBeNull();
    expect(Object.keys(card).sort()).toEqual(['identity', 'revealed', 'word']);
  }
}

beforeEach(async () => {
  server = await startGameServer({ port: 0, dataDir: null, staticDir: null, quiet: true, store: new RoomStore(seeded(42)) });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  await server.close();
});

describe('rooms and lobby', () => {
  it('lets independent clients create and join a room and see each other', async () => {
    const { code, all } = await seatedRoom();
    for (const c of all) {
      const v = c.last();
      expect(v.code).toBe(code);
      expect(v.players.map((p) => p.name).sort()).toEqual(['Ada', 'Bora', 'Cem', 'Deniz', 'Ece']);
      expect(v.youId).toBe(c.session!.playerId);
    }
    const v = all[0].last();
    expect(v.players.find((p) => p.name === 'Ada')).toMatchObject({ team: 'red', role: 'spymaster', isHost: true });
    expect(v.players.find((p) => p.name === 'Ece')).toMatchObject({ team: null, role: null });
    expect(v.startCheck).toEqual({ ok: true });
  });

  it('handles invalid codes, bad names, duplicate names and full rooms', async () => {
    const a = await client();
    expect(await a.call('room:join', { code: 'ZZZZZZ', name: 'X' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(await a.call('room:create', { name: '   ' })).toMatchObject({ ok: false, error: 'NAME_INVALID' });
    const s = await ok(a.call<SessionInfo>('room:create', { name: 'Ada' }));
    const b = await client();
    expect(await b.call('room:join', { code: s.code.toLowerCase(), name: 'ADA' })).toMatchObject({ ok: false, error: 'NAME_TAKEN' });
    for (let i = 0; i < 15; i++) {
      const x = await client();
      await ok(x.call('room:join', { code: s.code, name: `P${i}` }));
    }
    const late = await client();
    expect(await late.call('room:join', { code: s.code, name: 'Late' })).toMatchObject({ ok: false, error: 'ROOM_FULL' });
  });

  it('enforces one spymaster per team and host-only controls', async () => {
    const { redOp, blueOp, spectator, redSpy } = await seatedRoom();
    expect(await redOp.call('lobby:choose', { team: 'red', role: 'spymaster' })).toMatchObject({ ok: false, error: 'SPYMASTER_TAKEN' });
    expect(await blueOp.call('game:start')).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await blueOp.call('host:assign', { playerId: redOp.session!.playerId, team: 'blue', role: 'operative' })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await spectator.call('host:settings', { language: 'en' })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await spectator.call('host:kick', { playerId: redSpy.session!.playerId })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await redSpy.call('lobby:choose', { team: 'green', role: 'operative' })).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    // The host can move another player.
    await ok(redSpy.call('host:assign', { playerId: spectator.session!.playerId, team: 'blue', role: 'operative' }));
    await settle();
    expect(redSpy.last().players.find((p) => p.name === 'Ece')).toMatchObject({ team: 'blue', role: 'operative' });
  });

  it('validates the start conditions', async () => {
    const host = await client();
    const s = await ok(host.call<SessionInfo>('room:create', { name: 'Ada' }));
    expect(await host.call('game:start')).toMatchObject({ ok: false, error: 'NEED_SPYMASTERS' });
    const b = await client();
    await ok(b.call('room:join', { code: s.code, name: 'B' }));
    await ok(host.call('lobby:choose', { team: 'red', role: 'spymaster' }));
    await ok(b.call('lobby:choose', { team: 'blue', role: 'spymaster' }));
    expect(await host.call('game:start')).toMatchObject({ ok: false, error: 'NEED_OPERATIVES' });
  });

  it('rejects every action from a socket that has not joined', async () => {
    await seatedRoom();
    const stranger = await client();
    for (const ev of ['game:start', 'game:clue', 'game:guess', 'game:endTurn', 'lobby:choose', 'host:assign', 'chat:send', 'game:rematch'] as const) {
      expect(await stranger.call(ev, { word: 'x', count: 1, index: 0, clueId: 1, team: 'red', role: 'spymaster', text: 'hi' })).toMatchObject({ ok: false, error: 'NOT_IN_ROOM' });
    }
    expect(await stranger.call('room:resume', { code: 'ABCDEF', token: 'x'.repeat(43) })).toMatchObject({ ok: false });
  });

  it('rejects malformed payloads without crashing', async () => {
    const { redSpy } = await seatedRoom();
    const res = await new Promise<Ack>((r) => (redSpy.socket.emit as (...a: unknown[]) => void)('game:start', 'nonsense', r));
    expect(res).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(await redSpy.call('host:settings', { language: 'xx' })).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    // Server still healthy.
    expect(await redSpy.call('host:settings', { language: 'en' })).toMatchObject({ ok: true });
  });
});

describe('hidden information', () => {
  it('never sends unrevealed identities to operatives or spectators, only to spymasters', async () => {
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    for (const c of [room.redOp, room.blueOp, room.spectator]) assertNoHiddenIdentities(c.last());
    for (const c of [room.redSpy, room.blueSpy]) {
      const m = c.last().match!;
      expect(m.visibility).toBe('key');
      expect(m.cards.every((x) => x.identity !== null)).toBe(true);
    }
    // Spymaster and operative boards show the same words in the same order.
    expect(room.redOp.last().match!.cards.map((c) => c.word)).toEqual(room.redSpy.last().match!.cards.map((c) => c.word));
  });
});

/** Uses the spymaster's key view to drive the game. */
function key(spy: Client): Identity[] {
  return spy.last().match!.cards.map((c) => c.identity as Identity);
}
function unrevealed(spy: Client, identity: Identity): number[] {
  const cards = spy.last().match!.cards;
  return cards.map((c, i) => ({ c, i })).filter(({ c }) => !c.revealed && c.identity === identity).map(({ i }) => i);
}

describe('full match over sockets', () => {
  it('plays a complete match with turn switching and victory, synchronised for everyone', async () => {
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    const starting = room.redSpy.last().match!.startingTeam;
    const spy = (t: Team) => (t === 'red' ? room.redSpy : room.blueSpy);
    const op = (t: Team) => (t === 'red' ? room.redOp : room.blueOp);
    const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');
    expect(key(room.redSpy).filter((x) => x === starting)).toHaveLength(9);

    // Turn 1: starting team clues 2 and finds one agent, then hits a neutral.
    let team = starting;
    await ok(spy(team).call('game:clue', { word: 'zibidi', count: 2 }));
    await settle();
    let clueId = op(team).last().match!.clue!.id;
    expect(room.spectator.last().match!.clue).toMatchObject({ word: 'zibidi', count: 2, team });
    await ok(op(team).call('game:guess', { index: unrevealed(spy(team), team)[0], clueId }));
    await ok(op(team).call('game:guess', { index: unrevealed(spy(team), 'neutral')[0], clueId }));
    await settle();
    expect(room.spectator.last().match!.turn).toBe(other(team));

    // Turn 2: the other team guesses one and ends voluntarily.
    team = other(team);
    expect(await op(team).call('game:endTurn', { clueId: 99 })).toMatchObject({ ok: false });
    await ok(spy(team).call('game:clue', { word: 'pofuduk', count: 1 }));
    await settle();
    clueId = op(team).last().match!.clue!.id;
    await ok(op(team).call('game:guess', { index: unrevealed(spy(team), team)[0], clueId }));
    await ok(op(team).call('game:endTurn', { clueId }));
    await settle();

    // Remaining turns: each team clues 'unlimited' and the starting team sweeps its agents.
    team = other(team);
    await ok(spy(team).call('game:clue', { word: 'lapacik', count: 'unlimited' }));
    await settle();
    clueId = op(team).last().match!.clue!.id;
    const targets = unrevealed(spy(team), team);
    for (const idx of targets) await ok(op(team).call('game:guess', { index: idx, clueId }));
    await settle();

    for (const c of room.all) {
      const m = c.last().match!;
      expect(m.phase).toBe('finished');
      expect(m.winner).toBe(team);
      expect(m.winReason).toBe('all_agents');
      // Full board is revealed to everybody only now.
      expect(m.visibility).toBe('key');
      expect(m.stats[team].correct).toBe(team === starting ? 9 : 8);
    }
    // Every operative/spectator payload before the end was clean.
    for (const c of [room.redOp, room.blueOp, room.spectator]) c.states.forEach(assertNoHiddenIdentities);
    expect(room.spectator.notices.some((n) => n.kind === 'match_over')).toBe(true);
  });

  it('ends the match on the assassin', async () => {
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    const t = room.redSpy.last().match!.startingTeam;
    const spy = t === 'red' ? room.redSpy : room.blueSpy;
    const op = t === 'red' ? room.redOp : room.blueOp;
    await ok(spy.call('game:clue', { word: 'zibidi', count: 1 }));
    await settle();
    await ok(op.call('game:guess', { index: unrevealed(spy, 'assassin')[0], clueId: op.last().match!.clue!.id }));
    await settle();
    expect(room.spectator.last().match).toMatchObject({ phase: 'finished', winReason: 'assassin', winner: t === 'red' ? 'blue' : 'red' });
  });

  it('rejects out-of-turn and out-of-role actions server-side', async () => {
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    const t = room.redSpy.last().match!.startingTeam;
    const [spy, op, oSpy, oOp] = t === 'red' ? [room.redSpy, room.redOp, room.blueSpy, room.blueOp] : [room.blueSpy, room.blueOp, room.redSpy, room.redOp];
    expect(await oSpy.call('game:clue', { word: 'zibidi', count: 1 })).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await op.call('game:clue', { word: 'zibidi', count: 1 })).toMatchObject({ ok: false, error: 'NOT_SPYMASTER' });
    expect(await room.spectator.call('game:clue', { word: 'zibidi', count: 1 })).toMatchObject({ ok: false, error: 'NOT_SPYMASTER' });
    const board = spy.last().match!.cards.map((c) => c.word);
    expect(await spy.call('game:clue', { word: board[0].toUpperCase(), count: 1 })).toMatchObject({ ok: false, error: 'CLUE_BOARD_WORD' });
    await ok(spy.call('game:clue', { word: 'zibidi', count: 1 }));
    expect(await spy.call('game:clue', { word: 'pofuduk', count: 1 })).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    await settle();
    const clueId = op.last().match!.clue!.id;
    expect(await spy.call('game:guess', { index: 0, clueId })).toMatchObject({ ok: false, error: 'NOT_OPERATIVE' });
    expect(await oOp.call('game:guess', { index: 0, clueId })).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await room.spectator.call('game:guess', { index: 0, clueId })).toMatchObject({ ok: false, error: 'NOT_OPERATIVE' });
    expect(await op.call('game:guess', { index: 0, clueId: clueId - 1 })).toMatchObject({ ok: false, error: 'STALE_ACTION' });
    // Seats are locked mid-match.
    expect(await spy.call('lobby:choose', { team: t, role: 'operative' })).toMatchObject({ ok: false, error: 'ROLE_LOCKED' });
    expect(await op.call('lobby:choose', { team: t === 'red' ? 'blue' : 'red', role: 'operative' })).toMatchObject({ ok: false, error: 'ROLE_LOCKED' });
    expect(await room.spectator.call('lobby:choose', { team: 'red', role: 'spymaster' })).toMatchObject({ ok: false, error: 'ROLE_LOCKED' });
    expect(await room.redSpy.call('host:settings', { language: 'en' })).toMatchObject({ ok: false, error: 'MATCH_IN_PROGRESS' });
    // Client-sent extra fields are ignored; no client can push state.
    expect(await op.call('game:guess', { index: unrevealed(spy, t)[0], clueId, identity: 'assassin', playerId: oOp.session!.playerId } as object)).toMatchObject({ ok: true });
    await settle();
    expect(room.spectator.last().match!.phase).not.toBe('finished');
  });

  it('resolves concurrent guesses on the same card exactly once', async () => {
    const room = await seatedRoom();
    // Second operative for the red team.
    await ok(room.spectator.call('lobby:choose', { team: 'red', role: 'operative' }));
    await ok(room.redSpy.call('host:settings', { startingTeam: 'red' }));
    await ok(room.redSpy.call('game:start'));
    await settle();
    await ok(room.redSpy.call('game:clue', { word: 'zibidi', count: 3 }));
    await settle();
    const clueId = room.redOp.last().match!.clue!.id;
    const idx = unrevealed(room.redSpy, 'red')[0];
    const results = await Promise.all([
      room.redOp.call('game:guess', { index: idx, clueId }),
      room.spectator.call('game:guess', { index: idx, clueId }),
      room.redOp.call('game:guess', { index: idx, clueId }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === 'CARD_REVEALED')).toBe(true);
    await settle();
    expect(room.redOp.last().match!.clue!.guessesMade).toBe(1);
  });
});

describe('reconnection, rematch and lifecycle', () => {
  it('marks disconnects, resumes with a fresh authorised snapshot, and replaces old sessions', async () => {
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    const session = room.redOp.session!;
    room.redOp.socket.disconnect();
    await room.redSpy.waitFor((v) => v.players.find((p) => p.id === session.playerId)?.connected === false);

    const back = await client();
    expect(await back.call('room:resume', { code: session.code, token: 'wrong'.repeat(9) })).toMatchObject({ ok: false, error: 'SESSION_INVALID' });
    await ok(back.call('room:resume', { code: session.code, token: session.token }));
    const snap = await back.waitFor((v) => v.match !== null);
    expect(snap.youId).toBe(session.playerId);
    assertNoHiddenIdentities(snap);
    await room.redSpy.waitFor((v) => v.players.find((p) => p.id === session.playerId)?.connected === true);

    // A spymaster resuming gets the key view again.
    const spySession = room.blueSpy.session!;
    const second = await client();
    await ok(second.call('room:resume', { code: spySession.code, token: spySession.token }));
    expect((await second.waitFor((v) => v.match !== null)).match!.visibility).toBe('key');
    // The older socket for that player was told it was replaced and can no longer act.
    await settle();
    expect(room.blueSpy.ended).toContain('replaced');
    expect(await room.blueSpy.call('chat:send', { text: 'hi' })).toMatchObject({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('supports rematch, return to lobby, chat, kick and host hand-over', async () => {
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    const firstWords = room.redSpy.last().match!.cards.map((c) => c.word);
    expect(await room.redOp.call('game:rematch')).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await room.redSpy.call('game:rematch')).toMatchObject({ ok: false, error: 'MATCH_IN_PROGRESS' });
    await ok(room.redSpy.call('game:toLobby'));
    await settle();
    expect(room.spectator.last().match).toBeNull();
    await ok(room.redSpy.call('game:start'));
    await settle();
    expect(room.spectator.last().matchNumber).toBe(2);
    const secondWords = room.redSpy.last().match!.cards.map((c) => c.word);
    expect(secondWords.filter((w) => firstWords.includes(w))).toHaveLength(0); // recent words avoided

    await ok(room.spectator.call('chat:send', { text: '  merhaba  ' }));
    await settle();
    expect(room.redOp.last().chat.at(-1)).toMatchObject({ name: 'Ece', text: 'merhaba' });
    expect(await room.spectator.call('chat:send', { text: '' })).toMatchObject({ ok: false, error: 'CHAT_INVALID' });

    await ok(room.redSpy.call('host:kick', { playerId: room.spectator.session!.playerId }));
    await settle();
    expect(room.spectator.ended).toContain('kicked');
    expect(room.redOp.last().players.some((p) => p.name === 'Ece')).toBe(false);
    expect(await room.spectator.call('room:resume', room.spectator.session!)).toMatchObject({ ok: false, error: 'SESSION_INVALID' });

    // Host leaves: host rights move on.
    await ok(room.redSpy.call('room:leave'));
    await settle();
    const v = room.redOp.last();
    expect(v.players.some((p) => p.name === 'Ada')).toBe(false);
    expect(v.players.find((p) => p.isHost)?.name).toBe('Bora');
  });
});

describe('persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'parola-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('restores rooms and running matches after a server restart, without storing raw tokens', async () => {
    await server.close();
    server = await startGameServer({ port: 0, dataDir: dir, staticDir: null, quiet: true });
    const room = await seatedRoom();
    await ok(room.redSpy.call('game:start'));
    await settle();
    const before = room.redSpy.last().match!.cards;
    const session = room.blueOp.session!;
    for (const c of clients.splice(0)) c.socket.disconnect();
    await server.close();

    const file = readFileSync(join(dir, 'rooms.json'), 'utf8');
    expect(file).not.toContain(session.token);

    server = await startGameServer({ port: 0, dataDir: dir, staticDir: null, quiet: true });
    const back = await client();
    await ok(back.call('room:resume', { code: session.code, token: session.token }));
    const snap = await back.waitFor((v) => v.match !== null);
    expect(snap.match!.cards.map((c) => c.word)).toEqual(before.map((c) => c.word));
    assertNoHiddenIdentities(snap);
    expect(snap.players.filter((p) => p.connected).map((p) => p.name)).toEqual(['Deniz']);
  });
});
