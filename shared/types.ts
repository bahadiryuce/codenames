// Shared domain and wire types. The server keeps the full MatchState; clients only
// ever receive the projected views defined at the bottom of this file.

export type Team = 'red' | 'blue';
export type Identity = Team | 'neutral' | 'assassin';
export type Role = 'spymaster' | 'operative';
export type Language = 'tr' | 'en';

export const TEAMS: readonly Team[] = ['red', 'blue'];
export const otherTeam = (team: Team): Team => (team === 'red' ? 'blue' : 'red');

/** 0–9, or 'unlimited' (official ∞ clue). 0 and 'unlimited' place no cap on guesses. */
export type ClueCount = number | 'unlimited';
export const MAX_CLUE_COUNT = 9;

export type MatchPhase = 'clue' | 'guess' | 'finished';

/** Visual theme a player picks for their introduction card. */
export const INTRO_STYLES = ['klasik', 'terminal', 'pist', 'parsomen', 'ajan', 'sahne'] as const;
export type IntroStyle = (typeof INTRO_STYLES)[number];

export const TEAM_NAME_MAX = 20;
export const TAGLINE_MAX = 60;
export type WinReason = 'all_agents' | 'assassin';
export type TurnEndReason = 'voluntary' | 'wrong_card' | 'limit';

// ---------- Server-only state ----------

export interface ServerCard {
  word: string;
  identity: Identity;
  revealed: boolean;
  revealedBy: Team | null;
  revealedOnTurn: number | null;
}

export interface Clue {
  id: number;
  team: Team;
  word: string;
  count: ClueCount;
  /** null = no limit (count 0 or unlimited) */
  maxGuesses: number | null;
  guessesMade: number;
  givenBy: string;
  givenAt: number;
}

export type LogEntry =
  | { kind: 'clue'; turn: number; team: Team; word: string; count: ClueCount; by: string; at: number }
  | { kind: 'guess'; turn: number; team: Team; cardIndex: number; word: string; identity: Identity; by: string; at: number }
  | { kind: 'turn_end'; turn: number; team: Team; reason: TurnEndReason; at: number; by?: string }
  | { kind: 'game_over'; turn: number; winner: Team; reason: WinReason; at: number };

export interface MatchState {
  language: Language;
  startingTeam: Team;
  cards: ServerCard[];
  turn: Team;
  turnNumber: number;
  phase: MatchPhase;
  clue: Clue | null;
  clueSeq: number;
  log: LogEntry[];
  winner: Team | null;
  winReason: WinReason | null;
  startedAt: number;
  finishedAt: number | null;
  /** Operatives' shared "I think this one" marks: card index → player ids. Public information. */
  marks: Record<number, string[]>;
}

// ---------- Projected views sent to clients ----------

/** What every player may see. `identity` is non-null only for revealed cards. */
export interface PublicCardView {
  word: string;
  revealed: boolean;
  identity: Identity | null;
}

/** What the key-card holder sees (the spymaster, or everyone once the match is over). */
export interface KeyCardView {
  word: string;
  revealed: boolean;
  identity: Identity;
}

export interface ClueView {
  id: number;
  team: Team;
  word: string;
  count: ClueCount;
  maxGuesses: number | null;
  guessesMade: number;
  givenBy: string;
}

export interface TeamStats {
  clues: number;
  correct: number;
  neutral: number;
  opponent: number;
  assassin: number;
}

interface MatchViewBase {
  language: Language;
  startingTeam: Team;
  turn: Team;
  turnNumber: number;
  phase: MatchPhase;
  clue: ClueView | null;
  remaining: Record<Team, number>;
  totals: Record<Team, number>;
  log: LogEntry[];
  winner: Team | null;
  winReason: WinReason | null;
  startedAt: number;
  finishedAt: number | null;
  stats: Record<Team, TeamStats>;
  /** Per card, the names of active-team operatives who marked it. */
  marks: string[][];
}

export interface PublicMatchView extends MatchViewBase {
  visibility: 'public';
  cards: PublicCardView[];
}

export interface KeyMatchView extends MatchViewBase {
  visibility: 'key';
  cards: KeyCardView[];
}

export type MatchView = PublicMatchView | KeyMatchView;

export type StartingTeamSetting = 'random' | Team;

export interface RoomSettings {
  language: Language;
  startingTeam: StartingTeamSetting;
  /** Run the introduction sequence before the first match. */
  intro: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  team: Team | null;
  role: Role | null;
  connected: boolean;
  isHost: boolean;
  introStyle: IntroStyle;
  tagline: string;
}

export type IntroStage = 'list' | 'showing' | 'result';

export interface IntroVotes {
  up: string[];
  down: string[];
}

/** Introduction sequence state. All of it is public. Votes hold player ids. */
export interface IntroView {
  stage: IntroStage;
  currentId: string | null;
  votes: Record<string, IntroVotes>;
  presented: string[];
}

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  team: Team | null;
  text: string;
  at: number;
}

export interface RoomView {
  code: string;
  revision: number;
  youId: string;
  hostId: string;
  players: PlayerView[];
  settings: RoomSettings;
  matchNumber: number;
  match: MatchView | null;
  /** Names chosen by each team; null means "use the default name". */
  teamNames: Record<Team, string | null>;
  intro: IntroView | null;
  chat: ChatMessage[];
  startCheck: { ok: true } | { ok: false; reason: ErrorCode };
}

// ---------- Errors ----------

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'SESSION_INVALID'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'NAME_INVALID'
  | 'NAME_TAKEN'
  | 'PLAYER_NOT_FOUND'
  | 'SPYMASTER_TAKEN'
  | 'ROLE_LOCKED'
  | 'MATCH_IN_PROGRESS'
  | 'NO_MATCH'
  | 'NEED_SPYMASTERS'
  | 'NEED_OPERATIVES'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_YOUR_TURN'
  | 'NOT_SPYMASTER'
  | 'NOT_OPERATIVE'
  | 'WRONG_PHASE'
  | 'STALE_ACTION'
  | 'CARD_INVALID'
  | 'CARD_REVEALED'
  | 'MUST_GUESS_FIRST'
  | 'CLUE_EMPTY'
  | 'CLUE_TOO_LONG'
  | 'CLUE_NOT_ONE_WORD'
  | 'CLUE_BAD_CHARS'
  | 'CLUE_BOARD_WORD'
  | 'CLUE_WORD_FORM'
  | 'CLUE_COUNT_INVALID'
  | 'CHAT_INVALID'
  | 'TEAM_NAME_INVALID'
  | 'TEAM_NAME_TAKEN'
  | 'NOT_ON_TEAM'
  | 'TAGLINE_INVALID'
  | 'INTRO_NOT_ACTIVE'
  | 'INTRO_IN_PROGRESS'
  | 'CANNOT_VOTE_SELF'
  | 'SERVER_ERROR';

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: ErrorCode; detail?: string };

// ---------- Socket protocol ----------

export interface SessionInfo {
  code: string;
  playerId: string;
  token: string;
}

export interface ServerToClientEvents {
  'room:state': (view: RoomView) => void;
  'room:notice': (notice: Notice) => void;
  'session:ended': (reason: 'kicked' | 'replaced' | 'room_closed') => void;
}

export type Notice =
  | { kind: 'reveal'; by: string; team: Team; word: string; identity: Identity }
  | { kind: 'clue'; team: Team; word: string; count: ClueCount }
  | { kind: 'turn'; team: Team; reason: TurnEndReason }
  | { kind: 'match_started'; startingTeam: Team }
  | { kind: 'match_over'; winner: Team; reason: WinReason }
  | { kind: 'host_changed'; name: string }
  | { kind: 'team_renamed'; team: Team; name: string | null };

type Cb<T = undefined> = (ack: Ack<T>) => void;

export interface ClientToServerEvents {
  'room:create': (p: { name: string; language: Language }, cb: Cb<SessionInfo>) => void;
  'room:join': (p: { code: string; name: string }, cb: Cb<SessionInfo>) => void;
  'room:resume': (p: { code: string; token: string }, cb: Cb<SessionInfo>) => void;
  'room:leave': (p: Record<string, never>, cb: Cb) => void;
  'lobby:choose': (p: { team: Team | null; role: Role | null }, cb: Cb) => void;
  'host:assign': (p: { playerId: string; team: Team | null; role: Role | null }, cb: Cb) => void;
  'host:settings': (p: Partial<RoomSettings>, cb: Cb) => void;
  'host:kick': (p: { playerId: string }, cb: Cb) => void;
  'host:transfer': (p: { playerId: string }, cb: Cb) => void;
  'host:shuffle': (p: Record<string, never>, cb: Cb) => void;
  'game:start': (p: Record<string, never>, cb: Cb) => void;
  'game:clue': (p: { word: string; count: ClueCount }, cb: Cb) => void;
  'game:guess': (p: { index: number; clueId: number }, cb: Cb) => void;
  'game:endTurn': (p: { clueId: number }, cb: Cb) => void;
  'game:rematch': (p: Record<string, never>, cb: Cb) => void;
  'game:toLobby': (p: Record<string, never>, cb: Cb) => void;
  'chat:send': (p: { text: string }, cb: Cb) => void;
  'player:profile': (p: { name?: string; introStyle?: IntroStyle; tagline?: string }, cb: Cb) => void;
  'team:rename': (p: { team: Team; name: string }, cb: Cb) => void;
  'game:mark': (p: { index: number; clueId: number }, cb: Cb) => void;
  'intro:begin': (p: Record<string, never>, cb: Cb) => void;
  'intro:present': (p: { playerId: string }, cb: Cb) => void;
  'intro:vote': (p: { value: 'up' | 'down' }, cb: Cb) => void;
  'intro:finish': (p: Record<string, never>, cb: Cb) => void;
  'intro:back': (p: Record<string, never>, cb: Cb) => void;
  'intro:end': (p: Record<string, never>, cb: Cb) => void;
}
