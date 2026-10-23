import { describe, expect, it } from 'vitest';
import { RoomStore, type Room } from '../server/rooms';
import { roomView } from '../server/views';
import { seeded } from './helpers';

function seatedRoom() {
  const store = new RoomStore(seeded(11), () => 1_700_000_000_000);
  const created = store.create('Ada', 'tr');
  if (!created.ok) throw new Error('create failed');
  const room: Room = created.value.room;
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
  store.choose(room, ids.ece, 'red', 'operative');
  return { store, room, ids };
}

describe('team names chosen by the teams', () => {
  it('lets only members of a team rename it', () => {
    const { store, room, ids } = seatedRoom();
    expect(room.teamNames).toEqual({ red: null, blue: null });
    expect(store.renameTeam(room, ids.bora, 'red', '  Kuzey   Yıldızları ')).toMatchObject({ ok: true });
    expect(room.teamNames.red).toBe('Kuzey Yıldızları');
    // The host is on red: still cannot rename blue.
    expect(store.renameTeam(room, ids.ada, 'blue', 'Ele Geçirildi')).toMatchObject({ ok: false, error: 'NOT_ON_TEAM' });
    expect(store.renameTeam(room, ids.cem, 'blue', 'Gece Kartalları')).toMatchObject({ ok: true });
    expect(roomView(room, ids.deniz).teamNames).toEqual({ red: 'Kuzey Yıldızları', blue: 'Gece Kartalları' });
  });

  it('validates names, rejects duplicates and resets on empty', () => {
    const { store, room, ids } = seatedRoom();
    store.renameTeam(room, ids.bora, 'red', 'Şimşek');
    expect(store.renameTeam(room, ids.cem, 'blue', 'SİMSEK')).toMatchObject({ ok: false, error: 'TEAM_NAME_TAKEN' });
    expect(store.renameTeam(room, ids.cem, 'blue', 'x'.repeat(21))).toMatchObject({ ok: false, error: 'TEAM_NAME_INVALID' });
    expect(store.renameTeam(room, ids.cem, 'blue', 42)).toMatchObject({ ok: false, error: 'TEAM_NAME_INVALID' });
    expect(store.renameTeam(room, ids.cem, 'green', 'X')).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(store.renameTeam(room, ids.bora, 'red', '   ')).toMatchObject({ ok: true });
    expect(room.teamNames.red).toBeNull();
  });

  it('locks team names while a match is running', () => {
    const { store, room, ids } = seatedRoom();
    expect(store.start(room, ids.ada)).toMatchObject({ ok: true });
    expect(store.renameTeam(room, ids.bora, 'red', 'Geç Kaldık')).toMatchObject({ ok: false, error: 'MATCH_IN_PROGRESS' });
  });
});

describe('player profile', () => {
  it('updates name, intro style and tagline with validation', () => {
    const { store, room, ids } = seatedRoom();
    expect(store.profile(room, ids.bora, { name: 'Bora K', introStyle: 'terminal', tagline: '  Hep  ilk ben bulurum ' })).toMatchObject({ ok: true });
    const bora = room.players.find((p) => p.id === ids.bora)!;
    expect(bora).toMatchObject({ name: 'Bora K', introStyle: 'terminal', tagline: 'Hep ilk ben bulurum' });
    expect(store.profile(room, ids.bora, { name: 'ada' })).toMatchObject({ ok: false, error: 'NAME_TAKEN' });
    expect(store.profile(room, ids.bora, { introStyle: 'yok' })).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(store.profile(room, ids.bora, { tagline: 'x'.repeat(61) })).toMatchObject({ ok: false, error: 'TAGLINE_INVALID' });
  });
});

describe('introduction sequence', () => {
  it('is host-driven, collects public votes and never lets a player vote on themselves', () => {
    const { store, room, ids } = seatedRoom();
    expect(store.beginIntro(room, ids.bora)).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(store.voteIntro(room, ids.bora, 'up')).toMatchObject({ ok: false, error: 'INTRO_NOT_ACTIVE' });
    expect(store.beginIntro(room, ids.ada)).toMatchObject({ ok: true });
    expect(store.beginIntro(room, ids.ada)).toMatchObject({ ok: false, error: 'INTRO_IN_PROGRESS' });
    expect(store.voteIntro(room, ids.bora, 'up')).toMatchObject({ ok: false, error: 'WRONG_PHASE' });

    expect(store.presentIntro(room, ids.ada, ids.cem)).toMatchObject({ ok: true });
    expect(store.voteIntro(room, ids.cem, 'up')).toMatchObject({ ok: false, error: 'CANNOT_VOTE_SELF' });
    store.voteIntro(room, ids.bora, 'up');
    store.voteIntro(room, ids.deniz, 'down');
    store.voteIntro(room, ids.deniz, 'up'); // changing a vote moves it
    store.voteIntro(room, ids.ece, 'down');
    expect(store.voteIntro(room, ids.ece, 'maybe')).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(room.intro!.votes[ids.cem]).toEqual({ up: [ids.bora, ids.deniz], down: [ids.ece] });

    expect(store.finishIntro(room, ids.bora)).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(store.finishIntro(room, ids.ada)).toMatchObject({ ok: true });
    expect(room.intro).toMatchObject({ stage: 'result', currentId: ids.cem, presented: [ids.cem] });
    expect(store.introBack(room, ids.ada)).toMatchObject({ ok: true });
    expect(room.intro).toMatchObject({ stage: 'list', currentId: null });
    expect(roomView(room, ids.ece).intro).toMatchObject({ stage: 'list', presented: [ids.cem] });
  });

  it('is cleared by starting the match, and recovers when the presented player leaves', () => {
    const { store, room, ids } = seatedRoom();
    store.beginIntro(room, ids.ada);
    store.presentIntro(room, ids.ada, ids.ece);
    store.voteIntro(room, ids.bora, 'up');
    store.leave(room, ids.ece);
    expect(room.intro).toMatchObject({ stage: 'list', currentId: null });
    expect(store.start(room, ids.ada)).toMatchObject({ ok: true });
    expect(room.intro).toBeNull();
    expect(store.beginIntro(room, ids.ada)).toMatchObject({ ok: false, error: 'MATCH_IN_PROGRESS' });
  });
});

describe('operative card marks', () => {
  it('lets active operatives toggle shared marks, clears them on reveal and on turn change', () => {
    const { store, room, ids } = seatedRoom();
    store.updateSettings(room, ids.ada, { startingTeam: 'red' });
    store.start(room, ids.ada);
    const m = room.match!;
    // Not during the clue phase.
    expect(store.mark(room, ids.bora, 0, 0)).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    store.clue(room, ids.ada, 'zibidi', 2);
    const clueId = m.clue!.id;
    const a = m.cards.findIndex((c) => c.identity === 'red');
    const b = m.cards.findIndex((c) => c.identity === 'neutral');
    expect(store.mark(room, ids.bora, a, clueId)).toMatchObject({ ok: true, value: { marked: true } });
    expect(store.mark(room, ids.ece, a, clueId)).toMatchObject({ ok: true });
    expect(store.mark(room, ids.bora, b, clueId)).toMatchObject({ ok: true });
    expect(store.mark(room, ids.deniz, a, clueId)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(store.mark(room, ids.ada, a, clueId)).toMatchObject({ ok: false, error: 'NOT_OPERATIVE' });
    expect(store.mark(room, ids.bora, a, clueId + 1)).toMatchObject({ ok: false, error: 'STALE_ACTION' });
    // Marks are public and carry names.
    const view = roomView(room, ids.deniz).match!;
    expect(view.marks[a]).toEqual(['Bora', 'Ece']);
    expect(view.marks[b]).toEqual(['Bora']);
    expect(view.visibility).toBe('public');
    // Toggle off.
    expect(store.mark(room, ids.ece, a, clueId)).toMatchObject({ ok: true, value: { marked: false } });
    // Revealing a card drops its marks; ending the turn drops all of them.
    store.guess(room, ids.bora, a, clueId);
    expect(m.marks[a]).toBeUndefined();
    expect(m.marks[b]).toEqual([ids.bora]);
    store.endTurn(room, ids.bora, clueId);
    expect(m.marks).toEqual({});
    expect(store.mark(room, ids.bora, b, clueId)).toMatchObject({ ok: false });
  });
});
