import { useEffect, useRef, useState } from 'react';
import type { Identity, LogEntry, MatchView, RoomView, Team } from '../../shared/types';
import { act, upper } from '../store';
import { teamName } from '../teams';
import { ChatPanel } from './Chat';
import { PlayerMenu } from './PlayerRow';
import { Button, Icon, useStrings } from './ui';

/** Team card in the reference style: huge remaining count, gold spymaster, operatives inline. */
export function TeamCard({ team, room, match }: { team: Team; room: RoomView; match: MatchView }) {
  const s = useStrings();
  const members = room.players.filter((p) => p.team === team);
  const spy = members.find((p) => p.role === 'spymaster');
  const ops = members.filter((p) => p.role === 'operative');
  const me = room.players.find((p) => p.id === room.youId);
  const iAmHost = room.hostId === room.youId;
  const active = match.turn === team && match.phase !== 'finished';
  const canJoin = me && me.team === null && match.phase !== 'finished';
  const name = (p: (typeof members)[number], cls: string) =>
    iAmHost ? (
      <PlayerMenu
        key={p.id}
        player={p}
        room={room}
        trigger={(open) => (
          <button type="button" className={`teamcard__person ${cls} ${p.connected ? '' : 'is-offline'} ${p.id === room.youId ? 'is-me' : ''}`} onClick={open}>
            {p.name}
          </button>
        )}
      />
    ) : (
      <span key={p.id} className={`teamcard__person ${cls} ${p.connected ? '' : 'is-offline'} ${p.id === room.youId ? 'is-me' : ''}`}>
        {p.name}
      </span>
    );
  return (
    <section className={`teamcard teamcard--${team} ${active ? 'is-active' : ''}`} aria-label={teamName(room, team, s)}>
      <span className="teamcard__art" aria-hidden />
      <h2 className="teamcard__name">{teamName(room, team, s)}</h2>
      <span className="teamcard__num" aria-label={`${match.remaining[team]} / ${match.totals[team]}`}>
        {match.remaining[team]}
      </span>
      <span className="teamcard__unit">{s.remaining}</span>
      <div className="teamcard__spy">
        <Icon name="crown" size={12} />
        {spy ? name(spy, 'teamcard__person--spy') : <span className="teamcard__vacant">{s.vacant}</span>}
      </div>
      <div className="teamcard__ops">{ops.map((p) => name(p, ''))}</div>
      {canJoin ? (
        <Button size="sm" variant={team} onClick={() => void act('lobby:choose', { team, role: 'operative' })}>
          {s.joinAsOperative}
        </Button>
      ) : null}
    </section>
  );
}

export function PhasePanel({ room, match }: { room: RoomView; match: MatchView }) {
  const s = useStrings();
  if (match.phase === 'finished') return null;
  const guessing = match.phase === 'guess';
  return (
    <section className={`phasepanel phasepanel--${match.turn}`}>
      <span className="phasepanel__label">
        <Icon name="clock" size={13} /> {s.turnLabel(match.turnNumber)}
      </span>
      <strong>{guessing ? s.phaseGuess : s.phaseClue}</strong>
      <span className="muted small">{teamName(room, match.turn, s)}</span>
      <span className={`phasepanel__bar ${guessing ? 'is-guess' : 'is-clue'}`} aria-hidden />
    </section>
  );
}

function LogList({ room, match }: { room: RoomView; match: MatchView }) {
  const s = useStrings();
  const list = useRef<HTMLOListElement>(null);
  // Scroll only the log box (scrollIntoView would also scroll the page).
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [match.log.length]);
  const up = (w: string) => upper(w, match.language);
  const idClass = (id: Identity) => `log__word--${id}`;
  const line = (e: LogEntry) => {
    switch (e.kind) {
      case 'clue':
        return (
          <>
            <Icon name="bulb" size={12} />
            <span>
              <span className="log__team">{s.logClue(teamName(room, e.team, s))}</span> <strong>{up(e.word)}</strong> ({e.count === 'unlimited' ? '∞' : e.count})
            </span>
          </>
        );
      case 'guess':
        return (
          <>
            <span className={`log__dot log__dot--${e.team}`} aria-hidden />
            <span className="log__by">{e.by}</span>
            <span aria-hidden>→</span>
            <span className={`log__word ${idClass(e.identity)}`}>{up(e.word)}</span>
          </>
        );
      case 'turn_end':
        return <em>{e.reason === 'voluntary' && e.by ? s.logEnded(e.by) : e.reason === 'limit' ? s.logLimit : ''}</em>;
      case 'game_over':
        return <strong>{s.wins(teamName(room, e.winner, s))}</strong>;
    }
  };
  const visible = match.log.filter((e) => !(e.kind === 'turn_end' && e.reason === 'wrong_card'));
  if (!visible.length) return <p className="log__empty">{s.logEmpty}</p>;
  return (
    <ol className="log__list" ref={list}>
      {visible.map((e, i) => (
        <li key={i} className={`log__item log__item--${e.kind} log__item--${'team' in e ? e.team : e.winner}`}>
          {line(e)}
        </li>
      ))}
    </ol>
  );
}

export function LogPanel({ room, match }: { room: RoomView; match: MatchView }) {
  const s = useStrings();
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const [seen, setSeen] = useState(room.chat.length);
  useEffect(() => {
    if (tab === 'chat') setSeen(room.chat.length);
  }, [tab, room.chat.length]);
  const unread = room.chat.length - seen;
  return (
    <section className="logpanel">
      <div className="logpanel__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'is-active' : ''} onClick={() => setTab('log')}>
          <Icon name="clock" size={13} /> {s.log}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}>
          <Icon name="chat" size={13} /> {s.chat}
          {unread > 0 && tab !== 'chat' ? <span className="logpanel__badge">{unread}</span> : null}
        </button>
      </div>
      <div className="logpanel__body" role="tabpanel">
        {tab === 'log' ? <LogList room={room} match={match} /> : <ChatPanel room={room} compact />}
      </div>
    </section>
  );
}
