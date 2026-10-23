import { computeStats, remainingAgents, totalAgents } from '../shared/engine';
import type {
  ClueView,
  KeyCardView,
  MatchState,
  MatchView,
  PlayerView,
  PublicCardView,
  RoomView,
  TeamStats,
} from '../shared/types';
import { startCheck, type Player, type Room } from './rooms';

// Per-viewer projection. This is the only place that turns server state into data
// sent to a browser. Objects are rebuilt field by field (never spread from server
// objects) so nothing hidden can leak by accident when the server model grows.

/** True if this viewer may see unrevealed identities. */
export function canSeeKey(match: MatchState, viewer: Player | null): boolean {
  if (match.phase === 'finished') return true;
  return viewer !== null && viewer.role === 'spymaster' && viewer.team !== null;
}

export function publicCards(match: MatchState): PublicCardView[] {
  return match.cards.map((c) => ({
    word: c.word,
    revealed: c.revealed,
    identity: c.revealed ? c.identity : null,
  }));
}

export function keyCards(match: MatchState): KeyCardView[] {
  return match.cards.map((c) => ({ word: c.word, revealed: c.revealed, identity: c.identity }));
}

export function matchView(match: MatchState, viewer: Player | null): MatchView {
  const clue: ClueView | null = match.clue
    ? {
        id: match.clue.id,
        team: match.clue.team,
        word: match.clue.word,
        count: match.clue.count,
        maxGuesses: match.clue.maxGuesses,
        guessesMade: match.clue.guessesMade,
        givenBy: match.clue.givenBy,
      }
    : null;
  const stats: Record<'red' | 'blue', TeamStats> = computeStats(match);
  const base = {
    language: match.language,
    startingTeam: match.startingTeam,
    turn: match.turn,
    turnNumber: match.turnNumber,
    phase: match.phase,
    clue,
    remaining: { red: remainingAgents(match, 'red'), blue: remainingAgents(match, 'blue') },
    totals: { red: totalAgents(match, 'red'), blue: totalAgents(match, 'blue') },
    // Log entries only ever carry identities of cards that are already revealed.
    log: match.log.map((e) => ({ ...e })),
    winner: match.winner,
    winReason: match.winReason,
    startedAt: match.startedAt,
    finishedAt: match.finishedAt,
    stats,
  };
  return canSeeKey(match, viewer)
    ? { ...base, visibility: 'key', cards: keyCards(match) }
    : { ...base, visibility: 'public', cards: publicCards(match) };
}

export function roomView(room: Room, viewerId: string): RoomView {
  const viewer = room.players.find((p) => p.id === viewerId) ?? null;
  const players: PlayerView[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    role: p.role,
    connected: p.connected,
    isHost: p.id === room.hostId,
  }));
  return {
    code: room.code,
    revision: room.revision,
    youId: viewerId,
    hostId: room.hostId,
    players,
    settings: { language: room.settings.language, startingTeam: room.settings.startingTeam },
    matchNumber: room.matchNumber,
    match: room.match ? matchView(room.match, viewer) : null,
    chat: room.chat.map((m) => ({ ...m })),
    startCheck: startCheck(room),
  };
}
