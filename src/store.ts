import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toUpper } from '../shared/text';
import type { Ack, ClientToServerEvents, ErrorCode, Notice, RoomView, ServerToClientEvents, SessionInfo } from '../shared/types';
import { STRINGS, type UiLang } from './i18n';
import { teamName } from './teams';

// Client state: one socket, the latest server snapshot, and UI-level flags. The
// client never derives game state itself; it renders whatever the server last sent.

export type ConnState = 'connecting' | 'online' | 'offline';
export type ClientError = ErrorCode | 'TIMEOUT' | 'OFFLINE';
export type EndReason = 'kicked' | 'replaced' | 'room_closed';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'red' | 'blue' | 'error' | 'success';
}

export interface AppState {
  conn: ConnState;
  everConnected: boolean;
  session: SessionInfo | null;
  room: RoomView | null;
  ended: EndReason | null;
  /** Set while resuming a stored session so the UI can show a loading state. */
  resuming: boolean;
  toasts: Toast[];
  uiLang: UiLang;
  lastNotice: Notice | null;
}

const SESSION_KEY = 'parola.session';
const REMEMBER_KEY = 'parola.sessions';
const LANG_KEY = 'parola.lang';
const NAME_KEY = 'parola.name';

// --- storage helpers (all wrapped: storage can be unavailable in private modes) ---

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
const local = () => window.localStorage;
const tab = () => window.sessionStorage;

/** Sessions remembered across tabs, keyed by room code, so a closed tab can resume. */
export function rememberedSession(code: string): (SessionInfo & { name: string }) | null {
  const all = read<Record<string, SessionInfo & { name: string }>>(local, REMEMBER_KEY) ?? {};
  return all[code] ?? null;
}
function remember(session: SessionInfo, name: string | null): void {
  const all = read<Record<string, SessionInfo & { name: string }>>(local, REMEMBER_KEY) ?? {};
  if (name === null) delete all[session.code];
  else all[session.code] = { ...session, name };
  // Keep only the 10 most recent rooms.
  const entries = Object.entries(all).slice(-10);
  write(local, REMEMBER_KEY, Object.fromEntries(entries));
}

export function savedName(): string {
  return read<string>(local, NAME_KEY) ?? '';
}

function detectLang(): UiLang {
  const stored = read<UiLang>(local, LANG_KEY);
  if (stored === 'tr' || stored === 'en') return stored;
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : navigator.language ? 'en' : 'tr';
}

// --- store ---

let state: AppState = {
  conn: 'connecting',
  everConnected: false,
  session: read<SessionInfo>(tab, SESSION_KEY),
  room: null,
  ended: null,
  resuming: false,
  toasts: [],
  uiLang: detectLang(),
  lastNotice: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const getState = () => state;
export const t = () => STRINGS[state.uiLang];

let toastSeq = 0;
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 4000): void {
  const id = ++toastSeq;
  set({ toasts: [...state.toasts.slice(-3), { id, text, tone }] });
  setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== id) }), ms);
}
export function dismissToast(id: number): void {
  set({ toasts: state.toasts.filter((x) => x.id !== id) });
}

export function setUiLang(lang: UiLang): void {
  write(local, LANG_KEY, lang);
  document.documentElement.lang = lang;
  set({ uiLang: lang });
}

// --- socket ---

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

export function call<T = undefined>(event: keyof ClientToServerEvents, payload: object = {}): Promise<Ack<T> | { ok: false; error: ClientError }> {
  if (!socket.connected) return Promise.resolve({ ok: false, error: 'OFFLINE' });
  return new Promise((resolve) => {
    (socket.timeout(8000).emit as (...a: unknown[]) => void)(event, payload, (err: unknown, res: Ack<T>) => {
      if (err) resolve({ ok: false, error: 'TIMEOUT' });
      else resolve(res);
    });
  });
}

/** Calls an action and toasts a friendly error on failure. Returns true on success. */
export async function act(event: keyof ClientToServerEvents, payload: object = {}): Promise<boolean> {
  const res = await call(event, payload);
  if (!res.ok) toast(t().errors[res.error] ?? t().errors.SERVER_ERROR, 'error');
  return res.ok;
}

/** `name` is known for create/join; on resume it comes from the next server snapshot. */
function adoptSession(session: SessionInfo, name: string | null): void {
  write(tab, SESSION_KEY, session);
  if (name !== null) {
    write(local, NAME_KEY, name);
    remember(session, name);
  }
  set({ session, ended: null, room: matchesSession(latestView, session) ? latestView : state.room });
  const path = `/r/${session.code}`;
  if (location.pathname !== path) history.replaceState(null, '', path);
}

export function clearSession(goHome = true): void {
  if (state.session) remember(state.session, null);
  write(tab, SESSION_KEY, null);
  set({ session: null, room: null, resuming: false });
  if (goHome && location.pathname !== '/') history.replaceState(null, '', '/');
}

export async function createRoom(name: string, language: 'tr' | 'en'): Promise<ClientError | null> {
  const res = await call<SessionInfo>('room:create', { name, language });
  if (!res.ok) return res.error;
  adoptSession(res.data, name.trim());
  return null;
}

export async function joinRoom(code: string, name: string): Promise<ClientError | null> {
  const res = await call<SessionInfo>('room:join', { code, name });
  if (!res.ok) return res.error;
  adoptSession(res.data, name.trim());
  return null;
}

export async function resumeSession(session: SessionInfo): Promise<ClientError | null> {
  set({ resuming: true, session });
  const res = await call<SessionInfo>('room:resume', { code: session.code, token: session.token });
  if (!res.ok) {
    if (res.error === 'ROOM_NOT_FOUND' || res.error === 'SESSION_INVALID') {
      remember(session, null);
      write(tab, SESSION_KEY, null);
      set({ session: null, room: null, resuming: false });
    } else {
      set({ resuming: false });
    }
    return res.error;
  }
  adoptSession(res.data, null);
  set({ resuming: false });
  return null;
}

export async function leaveRoom(): Promise<void> {
  await call('room:leave');
  clearSession();
}

socket.on('connect', () => {
  const wasOffline = state.everConnected && state.conn === 'offline';
  set({ conn: 'online', everConnected: true });
  // Always re-authenticate after (re)connecting and take the server's fresh snapshot.
  if (state.session && state.ended === null) {
    void resumeSession(state.session).then((errCode) => {
      if (errCode) toast(t().errors[errCode] ?? t().errors.SERVER_ERROR, 'error', 6000);
      else if (wasOffline) toast(t().reconnected, 'success', 2500);
    });
  }
});
socket.on('disconnect', () => set({ conn: 'offline' }));
socket.io.on('reconnect_attempt', () => {
  if (state.conn !== 'online') set({ conn: 'offline' });
});

// The server pushes the first snapshot just before it acknowledges create/join/resume,
// so the newest snapshot is kept here and adopted once the session is known.
let latestView: RoomView | null = null;

function matchesSession(view: RoomView | null, session: SessionInfo | null): view is RoomView {
  return !!view && !!session && view.code === session.code && view.youId === session.playerId;
}

socket.on('room:state', (view) => {
  if (latestView && latestView.code === view.code && view.revision < latestView.revision) return; // out of order
  latestView = view;
  if (matchesSession(view, state.session)) {
    // Remember this browser's seat (with the server's name for it) so a closed tab can resume.
    const me = view.players.find((p) => p.id === view.youId);
    const known = rememberedSession(view.code);
    if (me && (known?.playerId !== me.id || known.name !== me.name)) remember(state.session!, me.name);
    set({ room: view });
  }
});

socket.on('room:notice', (notice) => {
  set({ lastNotice: notice });
  const s = t();
  const room = state.room;
  const lang = room?.match?.language ?? room?.settings.language ?? 'tr';
  const up = (w: string) => upper(w, lang);
  // Turn changes, clues, match start and match end have their own on-screen
  // overlays, so only events without one get a toast.
  switch (notice.kind) {
    case 'reveal': {
      const id = notice.identity;
      const label = id === 'red' || id === 'blue' ? s.agentOf(teamName(room, id, s)) : s.identity[id];
      toast(s.noticeReveal(notice.by, up(notice.word), label), id === 'red' || id === 'blue' ? id : id === 'assassin' ? 'error' : 'info');
      break;
    }
    case 'host_changed':
      toast(s.noticeHost(notice.name));
      break;
    case 'team_renamed':
      toast(s.noticeTeamRenamed(s.colorName[notice.team], notice.name ?? s.defaultTeamName[notice.team]), notice.team);
      break;
    default:
      break;
  }
});

socket.on('session:ended', (reason) => {
  if (reason !== 'replaced' && state.session) remember(state.session, null);
  if (reason !== 'replaced') write(tab, SESSION_KEY, null);
  set({ ended: reason, room: reason === 'replaced' ? state.room : null });
});

export function takeOverSession(): void {
  if (!state.session) return;
  set({ ended: null });
  void resumeSession(state.session);
}

export const upper = (w: string, lang: 'tr' | 'en') => toUpper(w, lang);
