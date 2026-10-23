import { useState, type ReactNode } from 'react';
import type { PlayerView, Role, RoomView, Team } from '../../shared/types';
import { act } from '../store';
import { teamName } from '../teams';
import { Avatar, Button, ConfirmDialog, Dialog, Icon, useStrings } from './ui';

/** Host-only options for one player (seat moves, host hand-over, kick). */
export function PlayerMenu({ player, room, trigger }: { player: PlayerView; room: RoomView; trigger: (open: () => void) => ReactNode }) {
  const s = useStrings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const isMe = player.id === room.youId;
  const matchActive = room.match !== null && room.match.phase !== 'finished';
  const locked = matchActive && player.role === 'spymaster';
  const hasSpy = (t: Team) => room.players.some((p) => p.team === t && p.role === 'spymaster' && p.id !== player.id);
  const seat = (team: Team | null, role: Role | null) => {
    setMenuOpen(false);
    void act('host:assign', { playerId: player.id, team, role });
  };
  return (
    <>
      {trigger(() => setMenuOpen(true))}
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={player.name} className="dialog--small" labelledBy={`pm-${player.id}`}>
        <div className="menu-list">
          {!locked ? (
            <>
              <span className="eyebrow">{s.moveTo}</span>
              {(['red', 'blue'] as const).map((t) => (
                <div key={t} className="menu-list__row">
                  <Button
                    size="sm"
                    variant={t}
                    disabled={hasSpy(t) || (player.team === t && player.role === 'spymaster') || (matchActive && player.team !== null && player.team !== t)}
                    onClick={() => seat(t, 'spymaster')}
                  >
                    {teamName(room, t, s)} · {s.spymasterShort}
                  </Button>
                  <Button
                    size="sm"
                    variant={t}
                    disabled={(player.team === t && player.role === 'operative') || (matchActive && player.team !== null && player.team !== t)}
                    onClick={() => seat(t, 'operative')}
                  >
                    {teamName(room, t, s)} · {s.operativeShort}
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
            <div className="menu-list__row">
              <Button
                size="sm"
                variant="ghost"
                icon="crown"
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
    </>
  );
}

/** Lobby player tile: avatar, name, role line, host badge, host menu. */
export function PlayerTile({ player, room }: { player: PlayerView; room: RoomView }) {
  const s = useStrings();
  const isMe = player.id === room.youId;
  const iAmHost = room.hostId === room.youId;
  const spy = player.role === 'spymaster';
  return (
    <li className={`tile ${spy ? 'tile--spy' : ''} ${isMe ? 'tile--me' : ''} ${player.connected ? '' : 'tile--offline'}`}>
      <Avatar name={player.name} team={player.team} gold={spy} />
      <span className="tile__text">
        <span className="tile__name">
          {spy ? <Icon name="crown" size={13} className="tile__crown" /> : null}
          {player.name}
        </span>
        <span className="tile__sub">
          {player.team ? (spy ? s.spymasterShort : s.operativeShort) : s.spectator}
          {isMe ? ` · ${s.you}` : ''}
          {!player.connected ? ` · ${s.offline}` : ''}
        </span>
      </span>
      {player.isHost ? <span className="badge badge--host">{s.host}</span> : null}
      {iAmHost ? (
        <PlayerMenu
          player={player}
          room={room}
          trigger={(open) => (
            <button type="button" className="icon-btn tile__menu" aria-label={s.playerMenu(player.name)} onClick={open}>
              <Icon name="menu" />
            </button>
          )}
        />
      ) : null}
    </li>
  );
}
