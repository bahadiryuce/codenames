import { maxGuessesFor, validateClueCount, validateClueWord } from './clue';
import {
  otherTeam,
  type ClueCount,
  type ErrorCode,
  type Identity,
  type Language,
  type MatchState,
  type ServerCard,
  type Team,
  type TeamStats,
  type TurnEndReason,
  type WinReason,
} from './types';

// Pure rule engine. Every action validates completely before it mutates anything, so a
// rejected action never leaves the match half-updated. The server runs each action
// synchronously, which makes a single action atomic with respect to other sockets.

export const BOARD_SIZE = 25;
export const STARTING_AGENTS = 9;
export const SECOND_AGENTS = 8;
export const NEUTRALS = 7;
export const ASSASSINS = 1;

/** Returns an integer in [0, n). Inject crypto.randomInt on the server, a seeded RNG in tests. */
export type RandomInt = (n: number) => number;

export function shuffle<T>(items: readonly T[], rand: RandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks `count` distinct entries without replacement. Throws if the pool is too small. */
export function pickWords(pool: readonly string[], count: number, rand: RandomInt, exclude: ReadonlySet<string> = new Set()): string[] {
  const unique = [...new Set(pool)];
  if (unique.length < count) throw new Error(`word pool too small: ${unique.length} < ${count}`);
  const fresh = unique.filter((w) => !exclude.has(w));
  // Prefer words not seen in recent matches, topping up from the rest if necessary.
  const primary = shuffle(fresh, rand).slice(0, count);
  if (primary.length === count) return primary;
  const rest = shuffle(unique.filter((w) => !primary.includes(w)), rand);
  return [...primary, ...rest.slice(0, count - primary.length)];
}

export function buildKey(startingTeam: Team, rand: RandomInt): Identity[] {
  const key: Identity[] = [
    ...Array<Identity>(STARTING_AGENTS).fill(startingTeam),
    ...Array<Identity>(SECOND_AGENTS).fill(otherTeam(startingTeam)),
    ...Array<Identity>(NEUTRALS).fill('neutral'),
    ...Array<Identity>(ASSASSINS).fill('assassin'),
  ];
  return shuffle(key, rand);
}

export function createMatch(opts: {
  words: readonly string[];
  startingTeam: Team;
  language: Language;
  rand: RandomInt;
  now: number;
}): MatchState {
  const { words, startingTeam, language, rand, now } = opts;
  if (words.length !== BOARD_SIZE || new Set(words).size !== BOARD_SIZE) {
    throw new Error('a board needs exactly 25 distinct words');
  }
  const key = buildKey(startingTeam, rand);
  const cards: ServerCard[] = words.map((word, i) => ({
    word,
    identity: key[i],
    revealed: false,
    revealedBy: null,
    revealedOnTurn: null,
  }));
  return {
    language,
    startingTeam,
    cards,
    turn: startingTeam,
    turnNumber: 1,
    phase: 'clue',
    clue: null,
    clueSeq: 0,
    log: [],
    winner: null,
    winReason: null,
    startedAt: now,
    finishedAt: null,
  };
}

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: ErrorCode; detail?: string };

const fail = (error: ErrorCode, detail?: string): { ok: false; error: ErrorCode; detail?: string } => ({ ok: false, error, detail });

export function remainingAgents(match: MatchState, team: Team): number {
  return match.cards.filter((c) => c.identity === team && !c.revealed).length;
}

export function totalAgents(match: MatchState, team: Team): number {
  return match.cards.filter((c) => c.identity === team).length;
}

export function unrevealedWords(match: MatchState): string[] {
  return match.cards.filter((c) => !c.revealed).map((c) => c.word);
}

function switchTurn(match: MatchState, reason: TurnEndReason, now: number): void {
  match.log.push({ kind: 'turn_end', turn: match.turnNumber, team: match.turn, reason, at: now });
  match.turn = otherTeam(match.turn);
  match.turnNumber += 1;
  match.phase = 'clue';
  match.clue = null;
}

function finish(match: MatchState, winner: Team, reason: WinReason, now: number): void {
  match.phase = 'finished';
  match.winner = winner;
  match.winReason = reason;
  match.finishedAt = now;
  match.clue = null;
  match.log.push({ kind: 'game_over', turn: match.turnNumber, winner, reason, at: now });
}

export function giveClue(
  match: MatchState,
  team: Team,
  rawWord: unknown,
  count: unknown,
  by: string,
  now: number,
): ActionResult<{ word: string; count: ClueCount }> {
  if (match.phase !== 'clue') return fail('WRONG_PHASE');
  if (match.turn !== team) return fail('NOT_YOUR_TURN');
  if (!validateClueCount(count)) return fail('CLUE_COUNT_INVALID');
  const check = validateClueWord(rawWord, unrevealedWords(match), match.language);
  if (!check.ok) return check;

  match.clueSeq += 1;
  match.clue = {
    id: match.clueSeq,
    team,
    word: check.word,
    count,
    maxGuesses: maxGuessesFor(count),
    guessesMade: 0,
    givenBy: by,
    givenAt: now,
  };
  match.phase = 'guess';
  match.log.push({ kind: 'clue', turn: match.turnNumber, team, word: check.word, count, by, at: now });
  return { ok: true, value: { word: check.word, count } };
}

export interface GuessOutcome {
  index: number;
  word: string;
  identity: Identity;
  turnEnded: TurnEndReason | null;
  gameOver: { winner: Team; reason: WinReason } | null;
}

export function guess(
  match: MatchState,
  team: Team,
  index: unknown,
  clueId: unknown,
  by: string,
  now: number,
): ActionResult<GuessOutcome> {
  if (match.phase !== 'guess' || !match.clue) return fail('WRONG_PHASE');
  if (match.turn !== team) return fail('NOT_YOUR_TURN');
  if (clueId !== match.clue.id) return fail('STALE_ACTION');
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= match.cards.length) {
    return fail('CARD_INVALID');
  }
  const card = match.cards[index];
  if (card.revealed) return fail('CARD_REVEALED');

  card.revealed = true;
  card.revealedBy = team;
  card.revealedOnTurn = match.turnNumber;
  match.clue.guessesMade += 1;
  match.log.push({ kind: 'guess', turn: match.turnNumber, team, cardIndex: index, word: card.word, identity: card.identity, by, at: now });

  const outcome: GuessOutcome = { index, word: card.word, identity: card.identity, turnEnded: null, gameOver: null };

  if (card.identity === 'assassin') {
    finish(match, otherTeam(team), 'assassin', now);
    outcome.gameOver = { winner: otherTeam(team), reason: 'assassin' };
    return { ok: true, value: outcome };
  }
  if (card.identity === 'red' || card.identity === 'blue') {
    // Revealing the last agent of either team wins for that team, even when the
    // opponent revealed it by mistake.
    if (remainingAgents(match, card.identity) === 0) {
      finish(match, card.identity, 'all_agents', now);
      outcome.gameOver = { winner: card.identity, reason: 'all_agents' };
      return { ok: true, value: outcome };
    }
  }
  if (card.identity !== team) {
    switchTurn(match, 'wrong_card', now);
    outcome.turnEnded = 'wrong_card';
  } else if (match.clue.maxGuesses !== null && match.clue.guessesMade >= match.clue.maxGuesses) {
    switchTurn(match, 'limit', now);
    outcome.turnEnded = 'limit';
  }
  return { ok: true, value: outcome };
}

export function endTurn(match: MatchState, team: Team, clueId: unknown, now: number): ActionResult {
  if (match.phase !== 'guess' || !match.clue) return fail('WRONG_PHASE');
  if (match.turn !== team) return fail('NOT_YOUR_TURN');
  if (clueId !== match.clue.id) return fail('STALE_ACTION');
  if (match.clue.guessesMade < 1) return fail('MUST_GUESS_FIRST');
  switchTurn(match, 'voluntary', now);
  return { ok: true, value: undefined };
}

export function computeStats(match: MatchState): Record<Team, TeamStats> {
  const blank = (): TeamStats => ({ clues: 0, correct: 0, neutral: 0, opponent: 0, assassin: 0 });
  const stats: Record<Team, TeamStats> = { red: blank(), blue: blank() };
  for (const entry of match.log) {
    if (entry.kind === 'clue') stats[entry.team].clues += 1;
    if (entry.kind === 'guess') {
      const s = stats[entry.team];
      if (entry.identity === entry.team) s.correct += 1;
      else if (entry.identity === 'neutral') s.neutral += 1;
      else if (entry.identity === 'assassin') s.assassin += 1;
      else s.opponent += 1;
    }
  }
  return stats;
}
