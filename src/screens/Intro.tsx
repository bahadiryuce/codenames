import { useState } from 'react';
import type { IntroStyle, IntroView, PlayerView, RoomView, Team } from '../../shared/types';
import { RoomBar } from '../components/TopBar';
import { Avatar, Backdrop, Button, Icon, useStrings } from '../components/ui';
import { act } from '../store';
import { teamName } from '../teams';

function tally(intro: IntroView, id: string) {
  const v = intro.votes[id] ?? { up: [], down: [] };
  const total = v.up.length + v.down.length;
  const pct = total ? Math.round((v.up.length / total) * 100) : null;
  return { up: v.up, down: v.down, total, pct };
}

/** Semicircle gauge (Pist theme): the needle follows the approval percentage. */
function Gauge({ pct }: { pct: number }) {
  const angle = -90 + (pct / 100) * 180;
  return (
    <svg className="gauge" viewBox="0 0 120 70" aria-hidden>
      <path d="M10 62a50 50 0 0 1 100 0" fill="none" stroke="rgb(255 255 255 / .12)" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 62a50 50 0 0 1 50-50" fill="none" stroke="#e3483c" strokeWidth="8" strokeLinecap="round" />
      <path d="M60 12a50 50 0 0 1 50 50" fill="none" stroke="#3ccf6e" strokeWidth="8" strokeLinecap="round" />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (Math.PI * i) / 8;
        return <line key={i} x1={60 - Math.cos(a) * 40} y1={62 - Math.sin(a) * 40} x2={60 - Math.cos(a) * 34} y2={62 - Math.sin(a) * 34} stroke="rgb(255 255 255 / .5)" strokeWidth="1.5" />;
      })}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '60px 62px', transition: 'transform 500ms cubic-bezier(.2,.7,.2,1)' }}>
        <line x1="60" y1="62" x2="60" y2="20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="62" r="6" fill="#fff" />
    </svg>
  );
}

function Ornament({ style, pct, name }: { style: IntroStyle; pct: number; name: string }) {
  switch (style) {
    case 'terminal':
      return (
        <pre className="introcard__term" aria-hidden>
          {`> ajan_tara --hedef "${name}"\n[ OK ] parmak izi eşleşti\n[ .. ] güven puanı hesaplanıyor`}
        </pre>
      );
    case 'pist':
      return <Gauge pct={pct} />;
    case 'parsomen':
      return (
        <svg className="introcard__quill" viewBox="0 0 40 40" aria-hidden>
          <path d="M33 4C20 6 11 15 8 30l-2 6 4-3c11-2 18-10 23-29Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 30 22 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'ajan':
      return <span className="introcard__stamp">GİZLİ · CLASSIFIED</span>;
    case 'sahne':
      return <span className="introcard__spot" aria-hidden />;
    default:
      return null;
  }
}

function VoterChips({ ids, room }: { ids: string[]; room: RoomView }) {
  return (
    <ul className="voters">
      {ids.map((id) => {
        const p = room.players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <li key={id} className={`voter voter--${p.team ?? 'none'}`}>
            {p.name}
          </li>
        );
      })}
    </ul>
  );
}

function IntroCardView({ room, subject, intro }: { room: RoomView; subject: PlayerView; intro: IntroView }) {
  const s = useStrings();
  const theme = s.introStyles[subject.introStyle];
  const t = tally(intro, subject.id);
  const pct = t.pct ?? 50;
  const result = intro.stage === 'result';
  return (
    <article className={`introcard introcard--${subject.introStyle} ${result ? 'introcard--result' : ''}`} aria-live="polite">
      <header className="introcard__head">
        <span className="introcard__kicker">{theme.kicker}</span>
        {subject.team ? <span className={`chip chip--team chip--${subject.team}`}>{teamName(room, subject.team, s)}</span> : null}
      </header>
      <div className="introcard__hero">
        {subject.introStyle === 'klasik' || subject.introStyle === 'sahne' ? <Avatar name={subject.name} team={subject.team} gold={subject.role === 'spymaster'} size="lg" /> : null}
        <Ornament style={subject.introStyle} pct={pct} name={subject.name} />
        <h2 className="introcard__name">{subject.name}</h2>
        <p className="introcard__tagline">{subject.tagline || s.introNoTagline}</p>
      </div>
      {result ? (
        <div className="introcard__result">
          <span className="introcard__pct">{t.pct === null ? '—' : `%${t.pct}`}</span>
          <p>{t.pct === null ? s.introNoVotes : s.introResult(t.pct)}</p>
        </div>
      ) : null}
      <div className="introcard__votes">
        <section className="votecol votecol--up">
          <header>
            <Icon name="thumbUp" /> {theme.up}
            <span className="votecol__n">{t.up.length}</span>
          </header>
          <VoterChips ids={t.up} room={room} />
        </section>
        <section className="votecol votecol--down">
          <header>
            <Icon name="thumbDown" /> {theme.down}
            <span className="votecol__n">{t.down.length}</span>
          </header>
          <VoterChips ids={t.down} room={room} />
        </section>
      </div>
      <footer className="introcard__bar">
        <span className="introcard__barlabel">
          <Icon name="thumbUp" size={12} /> {t.up.length}
        </span>
        <span className="approval" role="img" aria-label={`${s.introApproval} ${t.pct ?? 0}%`}>
          <span className="approval__up" style={{ width: `${t.total ? (t.up.length / t.total) * 100 : 50}%` }} />
        </span>
        <span className="introcard__barlabel">
          {t.down.length} <Icon name="thumbDown" size={12} />
        </span>
      </footer>
    </article>
  );
}

function PlayerPickList({ room, intro }: { room: RoomView; intro: IntroView }) {
  const s = useStrings();
  const iAmHost = room.hostId === room.youId;
  const groups: { key: Team | 'none'; title: string; players: PlayerView[] }[] = [
    { key: 'red', title: teamName(room, 'red', s), players: room.players.filter((p) => p.team === 'red') },
    { key: 'blue', title: teamName(room, 'blue', s), players: room.players.filter((p) => p.team === 'blue') },
    { key: 'none', title: s.spectators, players: room.players.filter((p) => p.team === null) },
  ];
  return (
    <div className="picklist">
      {groups
        .filter((g) => g.players.length)
        .map((g) => (
          <section key={g.key} className={`picklist__col picklist__col--${g.key}`}>
            <h2 className="picklist__title">
              <Icon name="users" size={14} /> {g.title}
            </h2>
            <ul>
              {g.players.map((p) => {
                const t = tally(intro, p.id);
                const done = intro.presented.includes(p.id);
                const content = (
                  <>
                    <Avatar name={p.name} team={p.team} gold={p.role === 'spymaster'} size="sm" />
                    <span className="pickrow__name">
                      {p.role === 'spymaster' ? <Icon name="crown" size={12} className="tile__crown" /> : null}
                      {p.name}
                    </span>
                    {done ? (
                      <>
                        <span className="chip chip--approval">
                          {s.introApproval} %{t.pct ?? 0}
                        </span>
                        <span className="chip chip--up">
                          <Icon name="thumbUp" size={11} /> {t.up.length}
                        </span>
                        <span className="chip chip--down">
                          <Icon name="thumbDown" size={11} /> {t.down.length}
                        </span>
                      </>
                    ) : (
                      <span className={`chip chip--style chip--${p.introStyle}`}>{s.introStyles[p.introStyle].label}</span>
                    )}
                  </>
                );
                return (
                  <li key={p.id} className={`pickrow ${done ? 'pickrow--done' : ''}`}>
                    {iAmHost ? (
                      <button type="button" className="pickrow__btn" onClick={() => void act('intro:present', { playerId: p.id })}>
                        {content}
                        <Icon name="play" size={12} className="pickrow__go" />
                      </button>
                    ) : (
                      <div className="pickrow__btn">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}

export function Intro({ room }: { room: RoomView }) {
  const s = useStrings();
  const intro = room.intro!;
  const iAmHost = room.hostId === room.youId;
  const subject = intro.currentId ? room.players.find((p) => p.id === intro.currentId) : undefined;
  const [busy, setBusy] = useState(false);
  const tone: 'red' | 'blue' | 'night' = subject?.team ?? 'night';
  const myVote = subject ? (intro.votes[subject.id]?.up.includes(room.youId) ? 'up' : intro.votes[subject.id]?.down.includes(room.youId) ? 'down' : null) : null;
  const theme = subject ? s.introStyles[subject.introStyle] : null;

  const startMatch = async () => {
    setBusy(true);
    await act('game:start');
    setBusy(false);
  };

  return (
    <div className="screen screen--intro">
      <Backdrop tone={tone} />
      <div className="spotlights" aria-hidden />
      <RoomBar room={room} mode="intro" />
      <main className="intro">
        {intro.stage === 'list' || !subject ? (
          <>
            <p className="intro__title">
              <Icon name="sparkle" size={14} /> {iAmHost ? s.introPickTitle : s.introWaitTitle} <Icon name="sparkle" size={14} />
            </p>
            <PlayerPickList room={room} intro={intro} />
            {iAmHost ? (
              <div className="intro__actions">
                <Button variant="ghost" icon="arrowLeft" onClick={() => void act('intro:end')}>
                  {s.introBackToLobby}
                </Button>
                <Button variant="primary" size="lg" icon="play" busy={busy} disabled={!room.startCheck.ok} onClick={() => void startMatch()}>
                  {s.introStartMatch}
                </Button>
              </div>
            ) : null}
            {iAmHost && !room.startCheck.ok ? <p className="start-reason center">{s.errors[room.startCheck.reason]}</p> : null}
          </>
        ) : (
          <>
            <IntroCardView room={room} subject={subject} intro={intro} />
            <div className="intro__actions">
              {intro.stage === 'showing' && subject.id !== room.youId && theme ? (
                <div className="vote-buttons" role="group" aria-label={s.introVoteHint}>
                  <Button variant="success" size="lg" icon="thumbUp" aria-pressed={myVote === 'up'} className={myVote === 'up' ? 'is-chosen' : ''} onClick={() => void act('intro:vote', { value: 'up' })}>
                    {theme.up}
                  </Button>
                  <Button variant="danger" size="lg" icon="thumbDown" aria-pressed={myVote === 'down'} className={myVote === 'down' ? 'is-chosen' : ''} onClick={() => void act('intro:vote', { value: 'down' })}>
                    {theme.down}
                  </Button>
                </div>
              ) : null}
              {intro.stage === 'showing' && subject.id === room.youId ? <p className="intro__note">{s.introYouArePresented}</p> : null}
              {iAmHost ? (
                intro.stage === 'showing' ? (
                  <Button variant="primary" icon="flag" onClick={() => void act('intro:finish')}>
                    {s.introFinish}
                  </Button>
                ) : (
                  <Button variant="primary" icon="arrowRight" onClick={() => void act('intro:back')}>
                    {s.introNext}
                  </Button>
                )
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
