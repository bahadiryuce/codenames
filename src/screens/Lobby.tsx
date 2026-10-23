import { useState } from 'react';
import type { RoomView, StartingTeamSetting, Team } from '../../shared/types';
import { PlayerRow } from '../components/PlayerRow';
import { copyInvite, inviteUrl, TopBar } from '../components/TopBar';
import { Button, useStrings } from '../components/ui';
import { act } from '../store';

export function Lobby({ room }: { room: RoomView }) {
  const s = useStrings();
  const me = room.players.find((p) => p.id === room.youId)!;
  const iAmHost = room.hostId === room.youId;
  const [starting, setStarting] = useState(false);
  const spectators = room.players.filter((p) => p.team === null);

  const start = async () => {
    setStarting(true);
    await act(room.match ? 'game:rematch' : 'game:start');
    setStarting(false);
  };

  return (
    <div className="screen">
      <TopBar room={room} />
      <main className="lobby">
        <section className="lobby__invite panel">
          <div>
            <h1 className="lobby__title">{s.lobby}</h1>
            <p className="muted">{s.inviteFriends}</p>
          </div>
          <div className="invite">
            <span className="invite__code" aria-label={s.roomCode}>
              {room.code}
            </span>
            <code className="invite__url">{inviteUrl(room.code)}</code>
            <Button variant="primary" onClick={() => void copyInvite(room.code, s)}>
              {s.copyLink}
            </Button>
          </div>
        </section>

        <section className="lobby__teams">
          {(['red', 'blue'] as Team[]).map((team) => {
            const members = room.players.filter((p) => p.team === team);
            const spy = members.find((p) => p.role === 'spymaster');
            const ops = members.filter((p) => p.role === 'operative');
            const meHere = me.team === team;
            return (
              <div key={team} className={`team-col team-col--${team}`}>
                <h2 className="team-col__title">{s.teamName(team)}</h2>
                <div className="seat-group">
                  <h3 className="seat-group__label">{s.spymaster}</h3>
                  {spy ? (
                    <ul className="players">
                      <PlayerRow player={spy} room={room} />
                    </ul>
                  ) : (
                    <div className="seat-empty">
                      <span>{s.vacant}</span>
                      <Button size="sm" variant={team} onClick={() => void act('lobby:choose', { team, role: 'spymaster' })}>
                        {s.becomeSpymaster}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="seat-group">
                  <h3 className="seat-group__label">{s.operatives}</h3>
                  {ops.length ? (
                    <ul className="players">
                      {ops.map((p) => (
                        <PlayerRow key={p.id} player={p} room={room} />
                      ))}
                    </ul>
                  ) : (
                    <p className="seat-empty seat-empty--text">{s.noOperatives}</p>
                  )}
                  {!(meHere && me.role === 'operative') ? (
                    <Button size="sm" variant={team} className="seat-join" onClick={() => void act('lobby:choose', { team, role: 'operative' })}>
                      {s.joinAsOperative}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>

        <section className="lobby__side">
          <div className="panel">
            <h2 className="panel__title">{s.unassigned}</h2>
            {spectators.length ? (
              <ul className="players">
                {spectators.map((p) => (
                  <PlayerRow key={p.id} player={p} room={room} />
                ))}
              </ul>
            ) : (
              <p className="muted">{s.noSpectators}</p>
            )}
            {me.team !== null ? (
              <Button size="sm" variant="ghost" onClick={() => void act('lobby:choose', { team: null, role: null })}>
                {s.watch}
              </Button>
            ) : null}
          </div>

          <div className="panel">
            <h2 className="panel__title">{s.settings}</h2>
            <fieldset className="setting" disabled={!iAmHost}>
              <legend>{s.wordLanguage}</legend>
              <div className="segmented">
                {(['tr', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={room.settings.language === l}
                    className={room.settings.language === l ? 'is-active' : ''}
                    onClick={() => void act('host:settings', { language: l })}
                  >
                    {l === 'tr' ? s.langTr : s.langEn}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="setting" disabled={!iAmHost}>
              <legend>{s.startingTeam}</legend>
              <div className="segmented">
                {(['random', 'red', 'blue'] as StartingTeamSetting[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={room.settings.startingTeam === v}
                    className={room.settings.startingTeam === v ? 'is-active' : ''}
                    onClick={() => void act('host:settings', { startingTeam: v })}
                  >
                    {v === 'random' ? s.random : s.team[v]}
                  </button>
                ))}
              </div>
            </fieldset>
            {!iAmHost ? <p className="muted small">{s.hostOnly}</p> : null}
            {iAmHost ? (
              <div className="lobby__start">
                <Button variant="ghost" disabled={room.players.length < 4} onClick={() => void act('host:shuffle')}>
                  {s.shuffleTeams}
                </Button>
                <Button variant="primary" size="lg" busy={starting} disabled={!room.startCheck.ok} onClick={start}>
                  {s.startGame}
                </Button>
              </div>
            ) : (
              <p className="waiting">
                <span className="spinner" aria-hidden /> {s.waitingForHost}
              </p>
            )}
            {!room.startCheck.ok ? (
              <p className="start-reason" role="status">
                {s.errors[room.startCheck.reason]}
              </p>
            ) : null}
          </div>

          <div className="panel panel--quiet">
            <ul className="role-help">
              <li>
                <strong>{s.host}</strong> {s.roleExplainHost.split(':').slice(1).join(':')}
              </li>
              <li>
                <strong>{s.spymaster}</strong> {s.roleExplainSpy.split(':').slice(1).join(':')}
              </li>
              <li>
                <strong>{s.operative}</strong> {s.roleExplainOp.split(':').slice(1).join(':')}
              </li>
            </ul>
            <p className="muted small">{s.minPlayers}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
