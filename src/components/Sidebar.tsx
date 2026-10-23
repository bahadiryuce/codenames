import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LogEntry, MatchView, RoomView, Team } from '../../shared/types';
import { act, upper } from '../store';
import { PlayerRow } from './PlayerRow';
import { Button, Glyph, useStrings } from './ui';

export function TeamPanel({ team, room, match }: { team: Team; room: RoomView; match: MatchView }) {
  const s = useStrings();
  const members = room.players.filter((p) => p.team === team);
  const spy = members.find((p) => p.role === 'spymaster');
  const ops = members.filter((p) => p.role === 'operative');
  const me = room.players.find((p) => p.id === room.youId);
  const left = match.remaining[team];
  const total = match.totals[team];
  const active = match.turn === team && match.phase !== 'finished';
  const canJoin = me && me.team === null && match.phase !== 'finished';
  return (
    <section className={`team-panel team-panel--${team} ${active ? 'is-active' : ''}`} aria-label={s.teamName(team)}>
      <header className="team-panel__head">
        <h2>{s.teamName(team)}</h2>
        <div className="team-panel__count" aria-label={s.ofAgents(left, total)}>
          <span className="team-panel__num">{left}</span>
          <span className="team-panel__unit">{s.agentsLeft}</span>
        </div>
      </header>
      <div className="pips" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`pip ${i < total - left ? 'is-found' : ''}`} />
        ))}
      </div>
      <h3 className="seat-group__label">{s.spymaster}</h3>
      {spy ? (
        <ul className="players">
          <PlayerRow player={spy} room={room} />
        </ul>
      ) : (
        <p className="seat-empty seat-empty--warn">{s.vacant}</p>
      )}
      <h3 className="seat-group__label">{s.operatives}</h3>
      {ops.length ? (
        <ul className="players">
          {ops.map((p) => (
            <PlayerRow key={p.id} player={p} room={room} />
          ))}
        </ul>
      ) : (
        <p className="seat-empty seat-empty--warn">{s.noOperatives}</p>
      )}
      {canJoin ? (
        <Button size="sm" variant={team} onClick={() => void act('lobby:choose', { team, role: 'operative' })}>
          {s.joinAsOperative}
        </Button>
      ) : null}
    </section>
  );
}

export function SpectatorList({ room }: { room: RoomView }) {
  const s = useStrings();
  const spectators = room.players.filter((p) => p.team === null);
  if (!spectators.length) return null;
  return (
    <section className="panel panel--compact spectators">
      <h3 className="seat-group__label">{s.spectators}</h3>
      <ul className="players">
        {spectators.map((p) => (
          <PlayerRow key={p.id} player={p} room={room} />
        ))}
      </ul>
    </section>
  );
}

export function GameLog({ match }: { match: MatchView }) {
  const s = useStrings();
  const list = useRef<HTMLOListElement>(null);
  // Scroll only the log box (scrollIntoView would also scroll the page).
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [match.log.length]);
  const up = (w: string) => upper(w, match.language);
  const line = (e: LogEntry) => {
    switch (e.kind) {
      case 'clue':
        return (
          <>
            <span className="log__clue">
              {up(e.word)} · {e.count === 'unlimited' ? '∞' : e.count}
            </span>
            <span className="muted"> — {e.by}</span>
          </>
        );
      case 'guess':
        return (
          <>
            <Glyph identity={e.identity} size={12} />
            <span className="log__word">{up(e.word)}</span>
            <span className="muted">
              {' '}
              — {e.by}, {s.identity[e.identity].toLowerCase()}
            </span>
          </>
        );
      case 'turn_end':
        return <span className="muted">{s.noticeTurn(e.team === 'red' ? 'blue' : 'red', e.reason)}</span>;
      case 'game_over':
        return <strong>{s.wins(e.winner)}</strong>;
    }
  };
  return (
    <section className="panel panel--compact log" aria-label={s.log}>
      <h2 className="panel__title">{s.log}</h2>
      {match.log.length === 0 ? (
        <p className="muted small">{s.logEmpty}</p>
      ) : (
        <ol className="log__list" ref={list}>
          {match.log.map((e, i) => (
            <li key={i} className={`log__item log__item--${e.kind} log__item--${'team' in e ? e.team : e.winner}`}>
              {line(e)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Chat({ room }: { room: RoomView }) {
  const s = useStrings();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.chat.length]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await act('chat:send', { text });
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <section className="panel panel--compact chat" aria-label={s.chat}>
      <h2 className="panel__title">{s.chat}</h2>
      <ol className="chat__list" ref={list} aria-live="polite">
        {room.chat.length === 0 ? <li className="muted small">{s.chatEmpty}</li> : null}
        {room.chat.map((m) => (
          <li key={m.id} className="chat__msg">
            <span className={`chat__name chat__name--${m.team ?? 'none'}`}>{m.name}</span> <span className="chat__text">{m.text}</span>
          </li>
        ))}
      </ol>
      <form className="chat__form" onSubmit={send}>
        <input
          className="input input--sm"
          value={text}
          maxLength={300}
          placeholder={s.chatPlaceholder}
          aria-label={s.chatPlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!text.trim()} busy={busy}>
          {s.send}
        </Button>
      </form>
    </section>
  );
}
