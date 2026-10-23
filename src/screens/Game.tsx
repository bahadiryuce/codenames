import { useEffect, useRef, useState } from 'react';
import type { Identity, MatchView, RoomView, Team } from '../../shared/types';
import { Board } from '../components/Board';
import { CluePill } from '../components/CluePanel';
import { LogPanel, PhasePanel, TeamCard } from '../components/Sidebar';
import { RoomBar } from '../components/TopBar';
import { AgentMark, Avatar, Backdrop, Button, ConfirmDialog, Dialog, useStrings } from '../components/ui';
import { act } from '../store';
import { teamName } from '../teams';

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** "Sıra X takımında" overlay, shown briefly whenever the turn passes. */
function TurnOverlay({ room, match }: { room: RoomView; match: MatchView }) {
  const s = useStrings();
  const [show, setShow] = useState<{ team: Team; key: number } | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (match.phase === 'finished') return;
    const key = `${room.matchNumber}:${match.turnNumber}`;
    if (last.current === key) return;
    last.current = key;
    setShow({ team: match.turn, key: match.turnNumber });
  }, [room.matchNumber, match.turnNumber, match.turn, match.phase]);
  // Separate effect so the hide timer is (re)armed whenever the overlay is shown.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(null), reducedMotion() ? 900 : 1700);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  const spy = room.players.find((p) => p.team === show.team && p.role === 'spymaster');
  return (
    <div className={`turn-overlay turn-overlay--${show.team}`} role="status" onClick={() => setShow(null)}>
      <p className="turn-overlay__text">{s.turnOverlay(teamName(room, show.team, s))}</p>
      <span className="turn-overlay__badge">{spy ? <Avatar name={spy.name} team={show.team} size="lg" /> : <AgentMark size={64} />}</span>
    </div>
  );
}

/** Split-screen win cinematic; the winner's half takes over, then the title appears. */
function WinCinematic({ room, winner, onDone }: { room: RoomView; winner: Team; onDone: () => void }) {
  const s = useStrings();
  const [stage, setStage] = useState(0);
  // Keep the timers stable across parent re-renders (room snapshots arrive constantly).
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (reducedMotion()) {
      setStage(2);
      const t = setTimeout(() => done.current(), 1200);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setStage(1), 1100);
    const t2 = setTimeout(() => setStage(2), 2100);
    const t3 = setTimeout(() => done.current(), 3600);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);
  return (
    <div className={`cinematic cinematic--${winner} cinematic--stage${stage}`} onClick={onDone} role="status">
      <div className="cinematic__half cinematic__half--red">
        <AgentMark size={160} className="cinematic__figure" />
        <span className="cinematic__team">{teamName(room, 'red', s)}</span>
      </div>
      <div className="cinematic__half cinematic__half--blue">
        <AgentMark size={160} className="cinematic__figure" />
        <span className="cinematic__team">{teamName(room, 'blue', s)}</span>
      </div>
      <p className="cinematic__title">{s.wins(teamName(room, winner, s))}</p>
    </div>
  );
}

function EndDialog({ room, match, open, onClose }: { room: RoomView; match: MatchView; open: boolean; onClose: () => void }) {
  const s = useStrings();
  const me = room.players.find((p) => p.id === room.youId);
  const iAmHost = room.hostId === room.youId;
  const winner = match.winner!;
  const [busy, setBusy] = useState(false);
  const mood = me?.team ? (me.team === winner ? s.youWon : s.youLost) : null;
  const rows: [string, (t: Team) => number][] = [
    [s.statRemaining, (t) => match.remaining[t]],
    [s.statClues, (t) => match.stats[t].clues],
    [s.statCorrect, (t) => match.stats[t].correct],
    [s.statNeutral, (t) => match.stats[t].neutral],
    [s.statOpponent, (t) => match.stats[t].opponent],
  ];
  return (
    <Dialog open={open} onClose={onClose} className={`dialog--end dialog--${winner}`} labelledBy="end-title">
      <div className={`end end--${winner}`}>
        <AgentMark size={44} />
        <h2 id="end-title" className="end__title">
          {s.wins(teamName(room, winner, s))}
        </h2>
        <p className="end__reason">{s.winReason[match.winReason!]}</p>
        {mood ? <p className="end__mood">{mood}</p> : null}
      </div>
      <table className="stats">
        <caption>{s.stats}</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" className="stats__red">
              {teamName(room, 'red', s)}
            </th>
            <th scope="col" className="stats__blue">
              {teamName(room, 'blue', s)}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{f('red')}</td>
              <td>{f('blue')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="end__meta muted">
        {s.duration}: {formatDuration((match.finishedAt ?? Date.now()) - match.startedAt)} · {s.turns}: {match.turnNumber}
      </p>
      <div className="dialog__actions dialog__actions--wrap">
        <Button variant="ghost" onClick={onClose}>
          {s.viewBoard}
        </Button>
        {iAmHost ? (
          <>
            <Button icon="arrowLeft" onClick={() => void act('game:toLobby')}>
              {s.backToLobby}
            </Button>
            <Button
              variant="primary"
              icon="play"
              busy={busy}
              disabled={!room.startCheck.ok}
              onClick={async () => {
                setBusy(true);
                await act('game:rematch');
                setBusy(false);
              }}
            >
              {s.rematch}
            </Button>
          </>
        ) : (
          <p className="waiting">
            <span className="spinner" aria-hidden /> {s.waitingRematch}
          </p>
        )}
      </div>
      {iAmHost && !room.startCheck.ok ? <p className="start-reason">{s.errors[room.startCheck.reason]}</p> : null}
    </Dialog>
  );
}

function Warnings({ room, match }: { room: RoomView; match: MatchView }) {
  const s = useStrings();
  if (match.phase === 'finished') return null;
  const t = match.turn;
  const members = room.players.filter((p) => p.team === t);
  const msgs: string[] = [];
  if (!members.some((p) => p.role === 'spymaster')) msgs.push(s.noSpymasterWarn(teamName(room, t, s)));
  if (match.phase === 'guess' && !members.some((p) => p.role === 'operative')) msgs.push(s.noOperativeWarn(teamName(room, t, s)));
  if (!msgs.length) return null;
  return (
    <div className="warn" role="alert">
      {msgs.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}

export function Game({ room }: { room: RoomView }) {
  const s = useStrings();
  const match = room.match!;
  const me = room.players.find((p) => p.id === room.youId);
  const iAmHost = room.hostId === room.youId;
  const isSpymaster = me?.role === 'spymaster';
  const canGuess = match.phase === 'guess' && me?.team === match.turn && me?.role === 'operative';
  const finished = match.phase === 'finished';
  const [zoom, setZoom] = useState(false);
  const [abortOpen, setAbortOpen] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  // Play the cinematic only when we watch the match end, not when reloading a finished one.
  const [cinematicFor, setCinematicFor] = useState<number | null>(null);
  const prevPhase = useRef(match.phase);
  useEffect(() => {
    if (prevPhase.current !== 'finished' && match.phase === 'finished') setCinematicFor(room.matchNumber);
    prevPhase.current = match.phase;
  }, [match.phase, room.matchNumber]);
  const showCinematic = finished && cinematicFor === room.matchNumber;
  const endOpen = finished && !showCinematic && dismissedFor !== room.matchNumber;

  useEffect(() => {
    document.title = finished ? `PAROLA · ${s.wins(teamName(room, match.winner!, s))}` : `PAROLA · ${s.turnOverlay(teamName(room, match.turn, s))}`;
    return () => {
      document.title = 'PAROLA';
    };
  }, [finished, match.turn, match.winner, room, s]);

  const identityLabel = (id: Identity) => (id === 'red' || id === 'blue' ? s.agentOf(teamName(room, id, s)) : s.identity[id]);
  const tone: Team = finished ? match.winner! : match.turn;

  const hostCenter = iAmHost ? (
    <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => (finished ? void act('game:toLobby') : setAbortOpen(true))}>
      {s.backToLobby}
    </Button>
  ) : null;

  return (
    <div className={`screen screen--game turn-${tone} ${zoom ? 'is-zoomed' : ''}`}>
      <Backdrop tone={tone} />
      <RoomBar room={room} mode="game" center={hostCenter} onZoom={() => setZoom((z) => !z)} />
      <main className="game">
        <aside className="game__side game__side--red">
          <TeamCard team="red" room={room} match={match} />
          <PhasePanel room={room} match={match} />
        </aside>

        <section className="game__center">
          <Warnings room={room} match={match} />
          {me?.team === null && !finished ? <p className="note">{s.spectatorNote}</p> : null}
          <Board match={match} canGuess={canGuess} isSpymaster={isSpymaster} identityLabel={identityLabel} myName={me?.name ?? ''} />
          <div className="game__pill">
            <CluePill match={match} me={me} teamLabel={teamName(room, match.turn, s)} />
            {finished && !endOpen && !showCinematic ? (
              <Button variant="primary" onClick={() => setDismissedFor(null)}>
                {s.showResults}
              </Button>
            ) : null}
          </div>
        </section>

        <aside className="game__side game__side--blue">
          <TeamCard team="blue" room={room} match={match} />
          <LogPanel room={room} match={match} />
        </aside>
      </main>

      <TurnOverlay room={room} match={match} />
      {showCinematic ? <WinCinematic room={room} winner={match.winner!} onDone={() => setCinematicFor(null)} /> : null}
      {finished ? <EndDialog room={room} match={match} open={endOpen} onClose={() => setDismissedFor(room.matchNumber)} /> : null}
      <ConfirmDialog
        open={abortOpen}
        text={s.backToLobbyConfirm}
        confirmLabel={s.backToLobby}
        cancelLabel={s.cancel}
        danger
        onConfirm={() => void act('game:toLobby')}
        onClose={() => setAbortOpen(false)}
      />
    </div>
  );
}
