import { describe, expect, it } from 'vitest';
import { buildKey, createMatch, endTurn, giveClue, guess, pickWords, remainingAgents } from '../shared/engine';
import type { Identity, MatchState, Team } from '../shared/types';
import { seeded, TEST_WORDS } from './helpers';

const NOW = 1_700_000_000_000;

function newMatch(startingTeam: Team = 'red', seed = 1): MatchState {
  return createMatch({ words: TEST_WORDS, startingTeam, language: 'tr', rand: seeded(seed), now: NOW });
}

const indexOf = (m: MatchState, identity: Identity, nth = 0) =>
  m.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.identity === identity && !c.revealed)[nth].i;

const count = (ids: Identity[], x: Identity) => ids.filter((i) => i === x).length;

describe('board generation', () => {
  it('builds a key with 9/8/7/1 for either starting team', () => {
    for (const team of ['red', 'blue'] as Team[]) {
      for (let seed = 0; seed < 200; seed++) {
        const key = buildKey(team, seeded(seed));
        const other = team === 'red' ? 'blue' : 'red';
        expect(key).toHaveLength(25);
        expect(count(key, team)).toBe(9);
        expect(count(key, other)).toBe(8);
        expect(count(key, 'neutral')).toBe(7);
        expect(count(key, 'assassin')).toBe(1);
      }
    }
  });

  it('creates 25 unique words, each with exactly one identity, starting team first', () => {
    const m = newMatch('blue');
    expect(m.cards).toHaveLength(25);
    expect(new Set(m.cards.map((c) => c.word)).size).toBe(25);
    expect(m.cards.every((c) => ['red', 'blue', 'neutral', 'assassin'].includes(c.identity))).toBe(true);
    expect(m.cards.every((c) => !c.revealed)).toBe(true);
    expect(m.startingTeam).toBe('blue');
    expect(m.turn).toBe('blue');
    expect(m.phase).toBe('clue');
    expect(remainingAgents(m, 'blue')).toBe(9);
    expect(remainingAgents(m, 'red')).toBe(8);
  });

  it('rejects boards that are not exactly 25 distinct words', () => {
    expect(() => createMatch({ words: TEST_WORDS.slice(0, 24), startingTeam: 'red', language: 'tr', rand: seeded(1), now: NOW })).toThrow();
    const dup = [...TEST_WORDS.slice(0, 24), TEST_WORDS[0]];
    expect(() => createMatch({ words: dup, startingTeam: 'red', language: 'tr', rand: seeded(1), now: NOW })).toThrow();
  });

  it('picks words without replacement and avoids recent words when possible', () => {
    const pool = Array.from({ length: 100 }, (_, i) => `w${i}`);
    const recent = new Set(pool.slice(0, 60));
    const picked = pickWords(pool, 25, seeded(3), recent);
    expect(new Set(picked).size).toBe(25);
    expect(picked.every((w) => !recent.has(w))).toBe(true);
    // When the fresh pool is too small it tops up from recent words, still distinct.
    const tight = pickWords(pool, 25, seeded(3), new Set(pool.slice(0, 90)));
    expect(new Set(tight).size).toBe(25);
  });
});

describe('turn mechanics', () => {
  it('accepts a valid clue from the active team and moves to guessing', () => {
    const m = newMatch('red');
    const res = giveClue(m, 'red', 'Meyve', 2, 'Ada', NOW);
    expect(res.ok).toBe(true);
    expect(m.phase).toBe('guess');
    expect(m.clue).toMatchObject({ word: 'meyve', count: 2, maxGuesses: 3, guessesMade: 0, team: 'red' });
  });

  it('rejects clues out of turn, out of phase, or invalid', () => {
    const m = newMatch('red');
    expect(giveClue(m, 'blue', 'meyve', 2, 'B', NOW)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(giveClue(m, 'red', 'elma', 1, 'A', NOW)).toMatchObject({ ok: false, error: 'CLUE_BOARD_WORD' });
    expect(giveClue(m, 'red', 'meyve', 10, 'A', NOW)).toMatchObject({ ok: false, error: 'CLUE_COUNT_INVALID' });
    expect(giveClue(m, 'red', 'meyve', 1.5, 'A', NOW)).toMatchObject({ ok: false, error: 'CLUE_COUNT_INVALID' });
    expect(giveClue(m, 'red', 'iki kelime', 1, 'A', NOW)).toMatchObject({ ok: false, error: 'CLUE_NOT_ONE_WORD' });
    expect(m.phase).toBe('clue');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    // A clue cannot be replaced once given.
    expect(giveClue(m, 'red', 'hayvan', 2, 'A', NOW)).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    expect(m.clue?.word).toBe('meyve');
  });

  it('lets operatives continue after a correct guess', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    const res = guess(m, 'red', indexOf(m, 'red'), m.clue!.id, 'O', NOW);
    expect(res).toMatchObject({ ok: true, value: { identity: 'red', turnEnded: null, gameOver: null } });
    expect(m.turn).toBe('red');
    expect(m.phase).toBe('guess');
    expect(m.clue?.guessesMade).toBe(1);
  });

  it('ends the turn on a neutral card', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    const res = guess(m, 'red', indexOf(m, 'neutral'), m.clue!.id, 'O', NOW);
    expect(res).toMatchObject({ ok: true, value: { identity: 'neutral', turnEnded: 'wrong_card' } });
    expect(m.turn).toBe('blue');
    expect(m.phase).toBe('clue');
    expect(m.clue).toBeNull();
    expect(m.turnNumber).toBe(2);
  });

  it('ends the turn on an opposing agent and credits the opponent', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    const before = remainingAgents(m, 'blue');
    const res = guess(m, 'red', indexOf(m, 'blue'), m.clue!.id, 'O', NOW);
    expect(res).toMatchObject({ ok: true, value: { identity: 'blue', turnEnded: 'wrong_card' } });
    expect(remainingAgents(m, 'blue')).toBe(before - 1);
    expect(m.turn).toBe('blue');
  });

  it('ends the match immediately on the assassin, opponent wins', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    const res = guess(m, 'red', indexOf(m, 'assassin'), m.clue!.id, 'O', NOW);
    expect(res).toMatchObject({ ok: true, value: { gameOver: { winner: 'blue', reason: 'assassin' } } });
    expect(m.phase).toBe('finished');
    expect(m.winner).toBe('blue');
    expect(m.winReason).toBe('assassin');
    // Nothing else can happen afterwards.
    expect(guess(m, 'blue', indexOf(m, 'blue'), 1, 'O', NOW)).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    expect(giveClue(m, 'blue', 'deniz', 1, 'B', NOW)).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
  });

  it('allows a voluntary end only after at least one guess', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    expect(endTurn(m, 'red', m.clue!.id, NOW)).toMatchObject({ ok: false, error: 'MUST_GUESS_FIRST' });
    guess(m, 'red', indexOf(m, 'red'), m.clue!.id, 'O', NOW);
    expect(endTurn(m, 'blue', m.clue!.id, NOW)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(endTurn(m, 'red', m.clue!.id, NOW)).toMatchObject({ ok: true });
    expect(m.turn).toBe('blue');
    expect(m.log.at(-1)).toMatchObject({ kind: 'turn_end', reason: 'voluntary', team: 'red' });
  });

  it('caps guesses at count + 1 (the extra guess) then ends the turn', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 2, 'A', NOW);
    const id = m.clue!.id;
    expect(guess(m, 'red', indexOf(m, 'red'), id, 'O', NOW)).toMatchObject({ ok: true, value: { turnEnded: null } });
    expect(guess(m, 'red', indexOf(m, 'red'), id, 'O', NOW)).toMatchObject({ ok: true, value: { turnEnded: null } });
    // Third guess = the extra one, allowed; then the turn is over.
    expect(guess(m, 'red', indexOf(m, 'red'), id, 'O', NOW)).toMatchObject({ ok: true, value: { turnEnded: 'limit' } });
    expect(m.turn).toBe('blue');
  });

  it('treats 0 and unlimited as no cap', () => {
    for (const count of [0, 'unlimited'] as const) {
      const m = newMatch('red');
      giveClue(m, 'red', 'meyve', count, 'A', NOW);
      expect(m.clue?.maxGuesses).toBeNull();
      for (let i = 0; i < 5; i++) {
        expect(guess(m, 'red', indexOf(m, 'red'), m.clue!.id, 'O', NOW)).toMatchObject({ ok: true, value: { turnEnded: null } });
      }
    }
  });

  it('wins when the last own agent is found', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 'unlimited', 'A', NOW);
    let last;
    for (let i = 0; i < 9; i++) last = guess(m, 'red', indexOf(m, 'red'), m.clue!.id, 'O', NOW);
    expect(last).toMatchObject({ ok: true, value: { gameOver: { winner: 'red', reason: 'all_agents' } } });
    expect(m.phase).toBe('finished');
    expect(m.winner).toBe('red');
  });

  it('awards the win to the opponent when their last agent is revealed by mistake', () => {
    const m = newMatch('red');
    // Reveal 7 of blue's 8 agents directly, leaving one.
    for (let i = 0; i < 7; i++) m.cards[indexOf(m, 'blue')].revealed = true;
    giveClue(m, 'red', 'meyve', 1, 'A', NOW);
    const res = guess(m, 'red', indexOf(m, 'blue'), m.clue!.id, 'O', NOW);
    expect(res).toMatchObject({ ok: true, value: { gameOver: { winner: 'blue', reason: 'all_agents' } } });
  });

  it('switches turns back and forth correctly', () => {
    const m = newMatch('blue');
    expect(m.turn).toBe('blue');
    giveClue(m, 'blue', 'meyve', 1, 'B', NOW);
    guess(m, 'blue', indexOf(m, 'neutral'), m.clue!.id, 'O', NOW);
    expect(m.turn).toBe('red');
    giveClue(m, 'red', 'hayvan', 1, 'A', NOW);
    guess(m, 'red', indexOf(m, 'red'), m.clue!.id, 'O', NOW);
    endTurn(m, 'red', m.clue!.id, NOW);
    expect(m.turn).toBe('blue');
    expect(m.turnNumber).toBe(3);
  });

  it('rejects duplicate, invalid and stale guesses without side effects', () => {
    const m = newMatch('red');
    giveClue(m, 'red', 'meyve', 3, 'A', NOW);
    const id = m.clue!.id;
    const target = indexOf(m, 'red');
    guess(m, 'red', target, id, 'O', NOW);
    const snapshot = JSON.stringify(m);
    expect(guess(m, 'red', target, id, 'O', NOW)).toMatchObject({ ok: false, error: 'CARD_REVEALED' });
    expect(guess(m, 'red', 25, id, 'O', NOW)).toMatchObject({ ok: false, error: 'CARD_INVALID' });
    expect(guess(m, 'red', -1, id, 'O', NOW)).toMatchObject({ ok: false, error: 'CARD_INVALID' });
    expect(guess(m, 'red', '3' as unknown as number, id, 'O', NOW)).toMatchObject({ ok: false, error: 'CARD_INVALID' });
    expect(guess(m, 'red', indexOf(m, 'red'), id + 1, 'O', NOW)).toMatchObject({ ok: false, error: 'STALE_ACTION' });
    expect(guess(m, 'blue', indexOf(m, 'blue'), id, 'O', NOW)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(JSON.stringify(m)).toBe(snapshot);
  });

  it('rejects guesses during the clue phase', () => {
    const m = newMatch('red');
    expect(guess(m, 'red', 0, 0, 'O', NOW)).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
  });
});
