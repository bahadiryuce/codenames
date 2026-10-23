import { describe, expect, it } from 'vitest';
import { RoomStore, type Room } from '../server/rooms';
import { matchView, roomView } from '../server/views';
import { seeded } from './helpers';

function startedRoom(): { store: RoomStore; room: Room; ids: Record<string, string> } {
  const store = new RoomStore(seeded(7), () => 1_700_000_000_000);
  const created = store.create('Ada', 'tr');
  if (!created.ok) throw new Error('create failed');
  const room = created.value.room;
  const ids: Record<string, string> = { ada: created.value.player.id };
  for (const name of ['Bora', 'Cem', 'Deniz', 'Ece']) {
    const j = store.join(room.code, name);
    if (!j.ok) throw new Error('join failed');
    ids[name.toLowerCase()] = j.value.player.id;
  }
  store.choose(room, ids.ada, 'red', 'spymaster');
  store.choose(room, ids.bora, 'red', 'operative');
  store.choose(room, ids.cem, 'blue', 'spymaster');
  store.choose(room, ids.deniz, 'blue', 'operative');
  const started = store.start(room, ids.ada);
  if (!started.ok) throw new Error(started.error);
  return { store, room, ids };
}

describe('per-viewer projection', () => {
  it('gives operatives, spectators and outsiders a public view without hidden identities', () => {
    const { room, ids } = startedRoom();
    for (const id of [ids.bora, ids.deniz, ids.ece, 'not-a-player']) {
      const v = roomView(room, id);
      expect(v.match!.visibility).toBe('public');
      const json = JSON.stringify(v);
      // No unrevealed identity anywhere in the payload.
      expect(v.match!.cards.every((c) => c.identity === null)).toBe(true);
      expect(json).not.toMatch(/"identity":"(red|blue|neutral|assassin)"/);
      expect(json).not.toContain('tokenHash');
      expect(json).not.toContain('keyViewers');
      expect(json).not.toContain('recentWords');
    }
  });

  it('gives both spymasters the full key', () => {
    const { room, ids } = startedRoom();
    for (const id of [ids.ada, ids.cem]) {
      const v = roomView(room, id);
      expect(v.match!.visibility).toBe('key');
      expect(v.match!.cards.filter((c) => c.identity === 'assassin')).toHaveLength(1);
    }
  });

  it('reveals identities only for revealed cards, and everything once finished', () => {
    const { store, room, ids } = startedRoom();
    const m = room.match!;
    const spy = m.turn === 'red' ? ids.ada : ids.cem;
    const op = m.turn === 'red' ? ids.bora : ids.deniz;
    store.clue(room, spy, 'zibidi', 1);
    const neutral = m.cards.findIndex((c) => c.identity === 'neutral');
    store.guess(room, op, neutral, m.clue!.id);
    const pub = matchView(m, room.players.find((p) => p.id === ids.ece)!);
    expect(pub.cards[neutral]).toEqual({ word: m.cards[neutral].word, revealed: true, identity: 'neutral' });
    expect(pub.cards.filter((c) => c.identity !== null)).toHaveLength(1);

    m.phase = 'finished';
    const after = matchView(m, room.players.find((p) => p.id === ids.ece)!);
    expect(after.visibility).toBe('key');
  });

  it('never carries server-only card fields', () => {
    const { room, ids } = startedRoom();
    const v = roomView(room, ids.ada);
    for (const c of v.match!.cards) expect(Object.keys(c).sort()).toEqual(['identity', 'revealed', 'word']);
  });
});
