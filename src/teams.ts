import type { RoomView, Team } from '../shared/types';
import type { Strings } from './i18n';

/** The name a team chose for itself, or the localized default. */
export function teamName(room: Pick<RoomView, 'teamNames'> | null | undefined, team: Team, s: Strings): string {
  return room?.teamNames?.[team] || s.defaultTeamName[team];
}

/** First letter for avatar circles (Turkish-aware uppercase). */
export function initial(name: string): string {
  const ch = [...name.trim()][0] ?? '?';
  return ch === 'i' ? 'İ' : ch === 'ı' ? 'I' : ch.toUpperCase();
}
