import { useState } from 'react';
import type { PlayerView, Role, RoomView, Team } from '../../shared/types';
import { act } from '../store';
import { Button, ConfirmDialog, Dialog, useStrings } from './ui';

export function PlayerRow({ player, room }: { player: PlayerView; room: RoomView }) {
  const s = useStrings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const isMe = player.id === room.youId;
  const iAmHost = room.hostId === room.youId;
  const matchActive = room.match !== null && room.match.phase !== 'finished';

  const seat = (team: Team | null, role: Role | null) => {
    setMenuOpen(false);
    void act('host:assign', { playerId: player.id, team, role });
  };
  const hasSpy = (t: Team) => room.players.some((p) => p.team === t && p.role === 'spymaster' && p.id !== player.id);
  const locked = matchActive && player.role === 'spymaster';

  return (
    <li className={`player ${isMe ? 'player--me' : ''} ${player.connected ? '' : 'player--offline'}`}>
      <span className={`player__presence ${player.connected ? 'is-on' : ''}`} aria-hidden />
      <span className="player__name">
        {player.name}
        {isMe ? <span className="player__you"> ({s.you})</span> : null}
      </span>
      {player.isHost ? <span className="badge badge--host">{s.host}</span> : null}
      {!player.connected ? <span className="sr-only">{s.offline}</span> : null}
      {iAmHost ? (
        <button type="button" className="player__menu-btn" aria-label={s.playerMenu(player.name)} onClick={() => setMenuOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
            <circle cx="4" cy="10" r="1.8" fill="currentColor" />
            <circle cx="10" cy="10" r="1.8" fill="currentColor" />
            <circle cx="16" cy="10" r="1.8" fill="currentColor" />
          </svg>
        </button>
      ) : null}

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={player.name} className="dialog--small" labelledBy={`pm-${player.id}`}>
        <div className="menu-grid">
          {!locked ? (
            <>
              <span className="menu-grid__label">{s.moveTo}</span>
              {(['red', 'blue'] as const).map((t) => (
                <div key={t} className="menu-grid__row">
                  <Button
                    size="sm"
                    variant={t}
                    disabled={hasSpy(t) || (player.team === t && player.role === 'spymaster') || (matchActive && player.team !== null && player.team !== t)}
                    onClick={() => seat(t, 'spymaster')}
                  >
                    {s.team[t]} · {s.spymaster}
                  </Button>
                  <Button
                    size="sm"
                    variant={t}
                    disabled={(player.team === t && player.role === 'operative') || (matchActive && player.team !== null && player.team !== t)}
                    onClick={() => seat(t, 'operative')}
                  >
                    {s.team[t]} · {s.operative}
                  </Button>
                </div>
              ))}
              <Button size="sm" disabled={player.team === null} onClick={() => seat(null, null)}>
                {s.spectator}
              </Button>
            </>
          ) : (
            <p className="muted">{s.errors.ROLE_LOCKED}</p>
          )}
          {!isMe ? (
            <div className="menu-grid__row">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMenuOpen(false);
                  void act('host:transfer', { playerId: player.id });
                }}
              >
                {s.makeHost}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setMenuOpen(false);
                  setKickOpen(true);
                }}
              >
                {s.kick}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="dialog__actions">
          <Button variant="ghost" onClick={() => setMenuOpen(false)}>
            {s.close}
          </Button>
        </div>
      </Dialog>
      <ConfirmDialog
        open={kickOpen}
        text={s.kickConfirm(player.name)}
        confirmLabel={s.kick}
        cancelLabel={s.cancel}
        danger
        onConfirm={() => void act('host:kick', { playerId: player.id })}
        onClose={() => setKickOpen(false)}
      />
    </li>
  );
}
