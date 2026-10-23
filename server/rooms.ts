import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createMatch, endTurn, giveClue, guess, pickWords, toggleMark, type GuessOutcome, type RandomInt } from '../shared/engine';
import { cleanName, foldWord } from '../shared/text';
import {
  INTRO_STYLES,
  TAGLINE_MAX,
  TEAMS,
  TEAM_NAME_MAX,
  type ChatMessage,
  type IntroStyle,
  type IntroView,
  type ClueCount,
  type ErrorCode,
  type Language,
  type MatchState,
  type Notice,
  type Role,
  type RoomSettings,
  type Team,
} from '../shared/types';
import { wordsFor } from '../shared/words/index';

// Room and player management plus authorization. Every exported action takes the
// acting player's id (resolved from an authenticated socket, never from the payload)
// and validates membership, host rights, roles, phase and turn before mutating.

export const MAX_PLAYERS = 16;
export const MIN_PLAYERS = 4;
export const CHAT_LIMIT = 100;
export const CHAT_MAX_LENGTH = 300;
const RECENT_WORDS_LIMIT = 100;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_LENGTH = 6;

export interface Player {
  id: string;
  tokenHash: string;
  name: string;
  team: Team | null;
  role: Role | null;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
  introStyle: IntroStyle;
  tagline: string;
}

export interface Room {
  code: string;
  createdAt: number;
  lastActivity: number;
  hostId: string;
  players: Player[];
  settings: RoomSettings;
  match: MatchState | null;
  matchNumber: number;
  /** Players who have held the key card during the current match; their seat is locked. */
  keyViewers: string[];
  recentWords: string[];
  teamNames: Record<Team, string | null>;
  /** Introduction sequence, when running (lobby only). */
  intro: IntroView | null;
  chat: ChatMessage[];
  chatSeq: number;
  revision: number;
}

export type Result<T = undefined> = { ok: true; value: T; notices?: Notice[] } | { ok: false; error: ErrorCode; detail?: string };

const err = (error: ErrorCode, detail?: string): { ok: false; error: ErrorCode; detail?: string } => ({ ok: false, error, detail });
const ok = <T>(value: T, notices?: Notice[]): Result<T> => ({ ok: true, value, notices });

export const secureRandInt: RandomInt = (n) => randomInt(n);

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isMatchActive(room: Room): boolean {
  return room.match !== null && room.match.phase !== 'finished';
}

export function startCheck(room: Room): { ok: true } | { ok: false; reason: ErrorCode } {
  if (isMatchActive(room)) return { ok: false, reason: 'MATCH_IN_PROGRESS' };
  for (const team of TEAMS) {
    const members = room.players.filter((p) => p.team === team);
    if (members.filter((p) => p.role === 'spymaster').length !== 1) return { ok: false, reason: 'NEED_SPYMASTERS' };
    if (members.filter((p) => p.role === 'operative').length < 1) return { ok: false, reason: 'NEED_OPERATIVES' };
  }
  if (room.players.filter((p) => p.team !== null).length < MIN_PLAYERS) return { ok: false, reason: 'NOT_ENOUGH_PLAYERS' };
  return { ok: true };
}

/** One line of free text: NFC, no control/format characters, collapsed whitespace. */
function cleanLine(raw: string): string {
  return raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
}

export interface NewSession {
  room: Room;
  player: Player;
  token: string;
}

export class RoomStore {
  readonly rooms = new Map<string, Room>();

  constructor(private readonly rand: RandomInt = secureRandInt, private readonly clock: () => number = Date.now) {}

  get(code: unknown): Room | undefined {
    if (typeof code !== 'string') return undefined;
    return this.rooms.get(code.trim().toUpperCase());
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('could not allocate a room code');
  }

  private newPlayer(name: string): { player: Player; token: string } {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock();
    return {
      token,
      player: {
        id: randomBytes(9).toString('base64url'),
        tokenHash: hashToken(token),
        name,
        team: null,
        role: null,
        connected: true,
        joinedAt: now,
        lastSeen: now,
        introStyle: 'klasik',
        tagline: '',
      },
    };
  }

  touch(room: Room): void {
    room.revision += 1;
    room.lastActivity = this.clock();
  }

  create(rawName: unknown, language: unknown): Result<NewSession> {
    const name = cleanName(rawName);
    if (!name) return err('NAME_INVALID');
    const lang: Language = language === 'en' ? 'en' : 'tr';
    const { player, token } = this.newPlayer(name);
    const now = this.clock();
    const room: Room = {
      code: this.newCode(),
      createdAt: now,
      lastActivity: now,
      hostId: player.id,
      players: [player],
      settings: { language: lang, startingTeam: 'random', intro: true },
      match: null,
      matchNumber: 0,
      keyViewers: [],
      recentWords: [],
      teamNames: { red: null, blue: null },
      intro: null,
      chat: [],
      chatSeq: 0,
      revision: 1,
    };
    this.rooms.set(room.code, room);
    return ok({ room, player, token });
  }

  join(code: unknown, rawName: unknown): Result<NewSession> {
    const room = this.get(code);
    if (!room) return err('ROOM_NOT_FOUND');
    const name = cleanName(rawName);
    if (!name) return err('NAME_INVALID');
    if (room.players.length >= MAX_PLAYERS) return err('ROOM_FULL');
    const folded = foldWord(name, 'tr');
    if (room.players.some((p) => foldWord(p.name, 'tr') === folded)) return err('NAME_TAKEN');
    const { player, token } = this.newPlayer(name);
    room.players.push(player);
    this.touch(room);
    return ok({ room, player, token });
  }

  /** Re-binds a returning client to its player using the secret token. */
  resume(code: unknown, token: unknown): Result<{ room: Room; player: Player }> {
    const room = this.get(code);
    if (!room) return err('ROOM_NOT_FOUND');
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return err('SESSION_INVALID');
    const player = room.players.find((p) => tokenMatches(token, p.tokenHash));
    if (!player) return err('SESSION_INVALID');
    return ok({ room, player });
  }

  setConnected(room: Room, playerId: string, connected: boolean): void {
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    player.lastSeen = this.clock();
    this.touch(room);
  }

  private member(room: Room, playerId: string): Player | undefined {
    return room.players.find((p) => p.id === playerId);
  }

  private hostOnly(room: Room, playerId: string): Result<Player> {
    const player = this.member(room, playerId);
    if (!player) return err('NOT_IN_ROOM');
    if (room.hostId !== playerId) return err('NOT_HOST');
    return ok(player);
  }

  private pickNewHost(room: Room): Player | undefined {
    const byAge = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt);
    return byAge.find((p) => p.connected) ?? byAge[0];
  }

  leave(room: Room, playerId: string): Result<{ roomClosed: boolean }> {
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return err('NOT_IN_ROOM');
    room.players.splice(idx, 1);
    if (room.intro) {
      for (const v of Object.values(room.intro.votes)) {
        v.up = v.up.filter((id) => id !== playerId);
        v.down = v.down.filter((id) => id !== playerId);
      }
      delete room.intro.votes[playerId];
      if (room.intro.currentId === playerId) {
        room.intro.stage = 'list';
        room.intro.currentId = null;
      }
    }
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return ok({ roomClosed: true });
    }
    const notices: Notice[] = [];
    if (room.hostId === playerId) {
      const next = this.pickNewHost(room)!;
      room.hostId = next.id;
      notices.push({ kind: 'host_changed', name: next.name });
    }
    this.touch(room);
    return ok({ roomClosed: false }, notices);
  }

  /**
   * Seat-change rules, shared by self-selection and host assignment:
   *  - At most one spymaster per team.
   *  - While a match is running, anyone who has held the key card is locked in place,
   *    and nobody may switch from one team to the other.
   *  - While a match is running, only the host may fill a (vacant) spymaster seat.
   */
  private applySeat(room: Room, target: Player, team: Team | null, role: Role | null, byHost: boolean): Result {
    if (team !== null && team !== 'red' && team !== 'blue') return err('BAD_REQUEST');
    if (role !== null && role !== 'spymaster' && role !== 'operative') return err('BAD_REQUEST');
    if (team === null) role = null;
    else if (role === null) role = 'operative';

    if (isMatchActive(room)) {
      if (room.keyViewers.includes(target.id) || target.role === 'spymaster') return err('ROLE_LOCKED');
      if (target.team !== null && team !== null && target.team !== team) return err('ROLE_LOCKED');
      if (role === 'spymaster' && !byHost) return err('ROLE_LOCKED');
    }
    if (role === 'spymaster' && room.players.some((p) => p.id !== target.id && p.team === team && p.role === 'spymaster')) {
      return err('SPYMASTER_TAKEN');
    }
    if (target.team === team && target.role === role) return ok(undefined);
    target.team = team;
    target.role = role;
    if (role === 'spymaster' && isMatchActive(room)) room.keyViewers.push(target.id);
    this.touch(room);
    return ok(undefined);
  }

  choose(room: Room, playerId: string, team: Team | null, role: Role | null): Result {
    const player = this.member(room, playerId);
    if (!player) return err('NOT_IN_ROOM');
    return this.applySeat(room, player, team, role, false);
  }

  assign(room: Room, actorId: string, targetId: unknown, team: Team | null, role: Role | null): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    const target = typeof targetId === 'string' ? this.member(room, targetId) : undefined;
    if (!target) return err('PLAYER_NOT_FOUND');
    return this.applySeat(room, target, team, role, true);
  }

  updateSettings(room: Room, actorId: string, patch: unknown): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    if (isMatchActive(room)) return err('MATCH_IN_PROGRESS');
    if (typeof patch !== 'object' || patch === null) return err('BAD_REQUEST');
    const p = patch as Record<string, unknown>;
    const next: RoomSettings = { ...room.settings };
    if ('language' in p) {
      if (p.language !== 'tr' && p.language !== 'en') return err('BAD_REQUEST');
      next.language = p.language;
    }
    if ('intro' in p) {
      if (typeof p.intro !== 'boolean') return err('BAD_REQUEST');
      next.intro = p.intro;
    }
    if ('startingTeam' in p) {
      if (p.startingTeam !== 'random' && p.startingTeam !== 'red' && p.startingTeam !== 'blue') return err('BAD_REQUEST');
      next.startingTeam = p.startingTeam;
    }
    room.settings = next;
    this.touch(room);
    return ok(undefined);
  }

  kick(room: Room, actorId: string, targetId: unknown): Result<{ kickedId: string }> {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    if (typeof targetId !== 'string' || targetId === actorId) return err('BAD_REQUEST');
    const target = this.member(room, targetId);
    if (!target) return err('PLAYER_NOT_FOUND');
    const res = this.leave(room, target.id);
    if (!res.ok) return res;
    return ok({ kickedId: target.id });
  }

  transferHost(room: Room, actorId: string, targetId: unknown): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    const target = typeof targetId === 'string' ? this.member(room, targetId) : undefined;
    if (!target) return err('PLAYER_NOT_FOUND');
    room.hostId = target.id;
    this.touch(room);
    return ok(undefined, [{ kind: 'host_changed', name: target.name }]);
  }

  /** Host convenience: random teams with one random spymaster each. Lobby only. */
  shuffleTeams(room: Room, actorId: string): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    if (isMatchActive(room)) return err('MATCH_IN_PROGRESS');
    if (room.players.length < MIN_PLAYERS) return err('NOT_ENOUGH_PLAYERS');
    const order = [...room.players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rand(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((p, i) => {
      p.team = i % 2 === 0 ? 'red' : 'blue';
      p.role = i < 2 ? 'spymaster' : 'operative';
    });
    this.touch(room);
    return ok(undefined);
  }

  start(room: Room, actorId: string): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    const check = startCheck(room);
    if (!check.ok) return err(check.reason);
    const startingTeam: Team =
      room.settings.startingTeam === 'random' ? (this.rand(2) === 0 ? 'red' : 'blue') : room.settings.startingTeam;
    const words = pickWords(wordsFor(room.settings.language), 25, this.rand, new Set(room.recentWords));
    room.match = createMatch({ words, startingTeam, language: room.settings.language, rand: this.rand, now: this.clock() });
    room.recentWords = [...words, ...room.recentWords].slice(0, RECENT_WORDS_LIMIT);
    room.matchNumber += 1;
    room.intro = null;
    room.keyViewers = room.players.filter((p) => p.role === 'spymaster').map((p) => p.id);
    this.touch(room);
    return ok(undefined, [{ kind: 'match_started', startingTeam }]);
  }

  backToLobby(room: Room, actorId: string): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    if (!room.match) return err('NO_MATCH');
    room.match = null;
    room.keyViewers = [];
    this.touch(room);
    return ok(undefined);
  }

  private activeMatch(room: Room, playerId: string, role: Role): Result<{ player: Player; match: MatchState; team: Team }> {
    const player = this.member(room, playerId);
    if (!player) return err('NOT_IN_ROOM');
    const match = room.match;
    if (!match) return err('NO_MATCH');
    if (match.phase === 'finished') return err('WRONG_PHASE');
    if (player.team === null || player.role === null) return err(role === 'spymaster' ? 'NOT_SPYMASTER' : 'NOT_OPERATIVE');
    if (player.team !== match.turn) return err('NOT_YOUR_TURN');
    if (player.role !== role) return err(role === 'spymaster' ? 'NOT_SPYMASTER' : 'NOT_OPERATIVE');
    return ok({ player, match, team: player.team });
  }

  clue(room: Room, playerId: string, word: unknown, count: unknown): Result<{ word: string; count: ClueCount }> {
    const ctx = this.activeMatch(room, playerId, 'spymaster');
    if (!ctx.ok) return ctx;
    const res = giveClue(ctx.value.match, ctx.value.team, word, count, ctx.value.player.name, this.clock());
    if (!res.ok) return res;
    this.touch(room);
    return ok(res.value, [{ kind: 'clue', team: ctx.value.team, word: res.value.word, count: res.value.count }]);
  }

  guess(room: Room, playerId: string, index: unknown, clueId: unknown): Result<GuessOutcome> {
    const ctx = this.activeMatch(room, playerId, 'operative');
    if (!ctx.ok) return ctx;
    const res = guess(ctx.value.match, ctx.value.team, index, clueId, ctx.value.player.name, this.clock());
    if (!res.ok) return res;
    this.touch(room);
    const o = res.value;
    const notices: Notice[] = [{ kind: 'reveal', by: ctx.value.player.name, team: ctx.value.team, word: o.word, identity: o.identity }];
    if (o.gameOver) notices.push({ kind: 'match_over', winner: o.gameOver.winner, reason: o.gameOver.reason });
    else if (o.turnEnded) notices.push({ kind: 'turn', team: ctx.value.match.turn, reason: o.turnEnded });
    return ok(o, notices);
  }

  endTurn(room: Room, playerId: string, clueId: unknown): Result {
    const ctx = this.activeMatch(room, playerId, 'operative');
    if (!ctx.ok) return ctx;
    const res = endTurn(ctx.value.match, ctx.value.team, clueId, this.clock(), ctx.value.player.name);
    if (!res.ok) return res;
    this.touch(room);
    return ok(undefined, [{ kind: 'turn', team: ctx.value.match.turn, reason: 'voluntary' }]);
  }

  mark(room: Room, playerId: string, index: unknown, clueId: unknown): Result<{ marked: boolean }> {
    const ctx = this.activeMatch(room, playerId, 'operative');
    if (!ctx.ok) return ctx;
    const res = toggleMark(ctx.value.match, ctx.value.team, playerId, index, clueId);
    if (!res.ok) return res;
    this.touch(room);
    return ok(res.value);
  }

  /** Name, introduction style and one-line introduction. Each field is optional. */
  profile(room: Room, playerId: string, patch: Record<string, unknown>): Result {
    const player = this.member(room, playerId);
    if (!player) return err('NOT_IN_ROOM');
    let { name, introStyle, tagline } = player;
    if ('name' in patch) {
      const n = cleanName(patch.name);
      if (!n) return err('NAME_INVALID');
      const folded = foldWord(n, 'tr');
      if (room.players.some((p) => p.id !== playerId && foldWord(p.name, 'tr') === folded)) return err('NAME_TAKEN');
      name = n;
    }
    if ('introStyle' in patch) {
      if (!INTRO_STYLES.includes(patch.introStyle as IntroStyle)) return err('BAD_REQUEST');
      introStyle = patch.introStyle as IntroStyle;
    }
    if ('tagline' in patch) {
      if (typeof patch.tagline !== 'string') return err('TAGLINE_INVALID');
      const t = cleanLine(patch.tagline);
      if ([...t].length > TAGLINE_MAX) return err('TAGLINE_INVALID');
      tagline = t;
    }
    if (name === player.name && introStyle === player.introStyle && tagline === player.tagline) return ok(undefined);
    Object.assign(player, { name, introStyle, tagline });
    this.touch(room);
    return ok(undefined);
  }

  /**
   * A team names itself: only members of that team may rename it, and not while a
   * match is running. An empty name restores the default.
   */
  renameTeam(room: Room, playerId: string, team: unknown, rawName: unknown): Result {
    const player = this.member(room, playerId);
    if (!player) return err('NOT_IN_ROOM');
    if (team !== 'red' && team !== 'blue') return err('BAD_REQUEST');
    if (player.team !== team) return err('NOT_ON_TEAM');
    if (isMatchActive(room)) return err('MATCH_IN_PROGRESS');
    if (typeof rawName !== 'string') return err('TEAM_NAME_INVALID');
    const cleaned = cleanLine(rawName);
    if ([...cleaned].length > TEAM_NAME_MAX) return err('TEAM_NAME_INVALID');
    const name = cleaned.length ? cleaned : null;
    const other = room.teamNames[team === 'red' ? 'blue' : 'red'];
    if (name && other && foldWord(name, 'tr') === foldWord(other, 'tr')) return err('TEAM_NAME_TAKEN');
    if (room.teamNames[team] === name) return ok(undefined);
    room.teamNames = { ...room.teamNames, [team]: name };
    this.touch(room);
    return ok(undefined, [{ kind: 'team_renamed', team, name }]);
  }

  // ----- Introduction sequence (host-driven, lobby only) -----

  private introCtx(room: Room, actorId: string, hostOnly: boolean): Result<IntroView> {
    if (!this.member(room, actorId)) return err('NOT_IN_ROOM');
    if (hostOnly && room.hostId !== actorId) return err('NOT_HOST');
    if (!room.intro) return err('INTRO_NOT_ACTIVE');
    return ok(room.intro);
  }

  beginIntro(room: Room, actorId: string): Result {
    const host = this.hostOnly(room, actorId);
    if (!host.ok) return host;
    if (isMatchActive(room)) return err('MATCH_IN_PROGRESS');
    if (room.intro) return err('INTRO_IN_PROGRESS');
    room.intro = { stage: 'list', currentId: null, votes: {}, presented: [] };
    this.touch(room);
    return ok(undefined);
  }

  presentIntro(room: Room, actorId: string, targetId: unknown): Result {
    const ctx = this.introCtx(room, actorId, true);
    if (!ctx.ok) return ctx;
    const target = typeof targetId === 'string' ? this.member(room, targetId) : undefined;
    if (!target) return err('PLAYER_NOT_FOUND');
    ctx.value.stage = 'showing';
    ctx.value.currentId = target.id;
    ctx.value.votes[target.id] = { up: [], down: [] };
    this.touch(room);
    return ok(undefined);
  }

  voteIntro(room: Room, actorId: string, value: unknown): Result {
    const ctx = this.introCtx(room, actorId, false);
    if (!ctx.ok) return ctx;
    const intro = ctx.value;
    if (intro.stage !== 'showing' || !intro.currentId) return err('WRONG_PHASE');
    if (value !== 'up' && value !== 'down') return err('BAD_REQUEST');
    if (intro.currentId === actorId) return err('CANNOT_VOTE_SELF');
    const votes = (intro.votes[intro.currentId] ??= { up: [], down: [] });
    votes.up = votes.up.filter((id) => id !== actorId);
    votes.down = votes.down.filter((id) => id !== actorId);
    votes[value].push(actorId);
    this.touch(room);
    return ok(undefined);
  }

  finishIntro(room: Room, actorId: string): Result {
    const ctx = this.introCtx(room, actorId, true);
    if (!ctx.ok) return ctx;
    const intro = ctx.value;
    if (intro.stage !== 'showing' || !intro.currentId) return err('WRONG_PHASE');
    intro.stage = 'result';
    if (!intro.presented.includes(intro.currentId)) intro.presented.push(intro.currentId);
    this.touch(room);
    return ok(undefined);
  }

  introBack(room: Room, actorId: string): Result {
    const ctx = this.introCtx(room, actorId, true);
    if (!ctx.ok) return ctx;
    ctx.value.stage = 'list';
    ctx.value.currentId = null;
    this.touch(room);
    return ok(undefined);
  }

  endIntro(room: Room, actorId: string): Result {
    const ctx = this.introCtx(room, actorId, true);
    if (!ctx.ok) return ctx;
    room.intro = null;
    this.touch(room);
    return ok(undefined);
  }

  chat(room: Room, playerId: string, rawText: unknown): Result {
    const player = this.member(room, playerId);
    if (!player) return err('NOT_IN_ROOM');
    if (typeof rawText !== 'string') return err('CHAT_INVALID');
    const text = rawText.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
    if (text.length < 1 || text.length > CHAT_MAX_LENGTH) return err('CHAT_INVALID');
    room.chatSeq += 1;
    room.chat.push({ id: room.chatSeq, playerId, name: player.name, team: player.team, text, at: this.clock() });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    this.touch(room);
    return ok(undefined);
  }

  /**
   * Housekeeping: hand host rights to a connected player when the host has been gone a
   * while, and delete abandoned rooms. Returns rooms that changed and codes removed.
   */
  sweep(opts: { hostGraceMs: number; idleTtlMs: number; maxAgeMs: number }): { changed: Room[]; removed: string[] } {
    const now = this.clock();
    const changed: Room[] = [];
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      const anyoneConnected = room.players.some((p) => p.connected);
      if ((!anyoneConnected && now - room.lastActivity > opts.idleTtlMs) || now - room.createdAt > opts.maxAgeMs) {
        this.rooms.delete(room.code);
        removed.push(room.code);
        continue;
      }
      const host = this.member(room, room.hostId);
      if (host && !host.connected && now - host.lastSeen > opts.hostGraceMs) {
        const next = room.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (next) {
          room.hostId = next.id;
          this.touch(room);
          changed.push(room);
        }
      }
    }
    return { changed, removed };
  }
}
