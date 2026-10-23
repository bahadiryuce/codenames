import { useEffect, useState } from 'react';
import type { MatchView, RoomView, Team } from '../../shared/types';
import { Board } from '../components/Board';
import { CluePanel } from '../components/CluePanel';
import { Chat, GameLog, SpectatorList, TeamPanel } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { Button, ConfirmDialog, Dialog, Glyph, useStrings } from '../components/ui';
import { act } from '../store';

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function TurnBanner({ match, room }: { match: MatchView; room: RoomView }) {
  const s = useStrings();
  const me = room.players.find((p) => p.id === room.youId);
  if (match.phase === 'finished' && match.winner) {
    return (
      <div className={`turn-banner turn-banner--${match.winner} turn-banner--done`} role="status">
        <strong>{s.wins(match.winner)}</strong>
        <span>{s.winReason[match.winReason!]}</span>
      </div>
    );
  }
  const mine = me?.team === match.turn;
  return (
    <div className={`turn-banner turn-banner--${match.turn}`} role="status" aria-live="polite">
      <strong>{mine ? `${s.yourTurn} · ${s.teamName(match.turn)}` : s.turnOf(match.turn)}</strong>
      <span className="turn-banner__turn">{s.turnLabel(match.turnNumber)}</span>
    </div>
  );
}

function ScoreStrip({ match }: { match: MatchView }) {
  const s = useStrings();
  return (
    <div className="score-strip" aria-hidden>
      {(['red', 'blue'] as Team[]).map((t) => (
        <span key={t} className={`score-strip__team score-strip__team--${t} ${match.turn === t && match.phase !== 'finished' ? 'is-active' : ''}`}>
          <Glyph identity={t} size={12} />
          <b>{match.remaining[t]}</b> {s.team[t]}
        </span>
      ))}
    </div>
  );
}

function Warnings({ room, match }: { room: RoomView; match: MatchView }) {
  const s = useStrings();
  if (match.phase === 'finished') return null;
  const t = match.turn;
  const members = room.players.filter((p) => p.team === t);
  const msgs: string[] = [];
  if (!members.some((p) => p.role === 'spymaster')) msgs.push(s.noSpymasterWarn(t));
  if (match.phase === 'guess' && !members.some((p) => p.role === 'operative')) msgs.push(s.noOperativeWarn(t));
  if (!msgs.length) return null;
  return (
    <div className="warn" role="alert">
      {msgs.map((m) => (
        <p key={m}>{m}</p>
      ))}
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
  return (
    <Dialog open={open} onClose={onClose} className={`dialog--end dialog--end-${winner}`} labelledBy="end-title">
      <div className={`end end--${winner}`}>
        <Glyph identity={winner} size={36} />
        <h2 id="end-title" className="end__title">
          {s.wins(winner)}
        </h2>
        <p className="end__reason">{s.winReason[match.winReason!]}</p>
        {mood ? <p className="end__mood">{mood}</p> : null}
      </div>
      <table className="stats">
        <caption>{s.stats}</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" className="stats__red">{s.team.red}</th>
            <th scope="col" className="stats__blue">{s.team.blue}</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              [s.statRemaining, (t: Team) => match.remaining[t]],
              [s.statClues, (t: Team) => match.stats[t].clues],
              [s.statCorrect, (t: Team) => match.stats[t].correct],
              [s.statNeutral, (t: Team) => match.stats[t].neutral],
              [s.statOpponent, (t: Team) => match.stats[t].opponent],
            ] as [string, (t: Team) => number][]
          ).map(([label, f]) => (
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
            <Button busy={busy} onClick={() => void act('game:toLobby')}>
              {s.backToLobby}
            </Button>
            <Button
              variant="primary"
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

type MobileTab = 'teams' | 'log' | 'chat';

export function Game({ room }: { room: RoomView }) {
  const s = useStrings();
  const match = room.match!;
  const me = room.players.find((p) => p.id === room.youId);
  const iAmHost = room.hostId === room.youId;
  const isSpymaster = me?.role === 'spymaster';
  const canGuess = match.phase === 'guess' && me?.team === match.turn && me?.role === 'operative';
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);
  const [tab, setTab] = useState<MobileTab>('teams');
  const finished = match.phase === 'finished';
  const endOpen = finished && dismissedFor !== room.matchNumber;

  useEffect(() => {
    document.title = finished ? `PAROLA · ${s.wins(match.winner!)}` : `PAROLA · ${s.turnOf(match.turn)}`;
    return () => {
      document.title = 'PAROLA';
    };
  }, [finished, match.turn, match.winner, s]);

  return (
    <div className={`screen screen--game turn-${finished ? match.winner : match.turn}`}>
      <TopBar
        room={room}
        extra={
          iAmHost && !finished ? (
            <Button variant="ghost" size="sm" onClick={() => setAbortOpen(true)}>
              {s.backToLobby}
            </Button>
          ) : null
        }
      />
      <main className={`game game--tab-${tab}`}>
        <aside className="game__side game__side--red">
          <TeamPanel team="red" room={room} match={match} />
          <GameLog match={match} />
        </aside>

        <section className="game__center">
          <ScoreStrip match={match} />
          <TurnBanner match={match} room={room} />
          <Warnings room={room} match={match} />
          {me?.team === null && !finished ? <p className="note">{s.spectatorNote}</p> : null}
          <Board match={match} canGuess={canGuess} isSpymaster={isSpymaster} />
          <CluePanel match={match} me={me} />
          {finished && !endOpen ? (
            <div className="finished-bar">
              <Button variant="primary" onClick={() => setDismissedFor(null)}>
                {s.showResults}
              </Button>
            </div>
          ) : null}
        </section>

        <aside className="game__side game__side--blue">
          <TeamPanel team="blue" room={room} match={match} />
          <SpectatorList room={room} />
          <Chat room={room} />
        </aside>

        <nav className="mobile-tabs" aria-label={s.teams}>
          {(['teams', 'log', 'chat'] as MobileTab[]).map((x) => (
            <button key={x} type="button" className={tab === x ? 'is-active' : ''} aria-pressed={tab === x} onClick={() => setTab(x)}>
              {x === 'teams' ? s.teams : x === 'log' ? s.log : s.chat}
            </button>
          ))}
        </nav>
      </main>

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
