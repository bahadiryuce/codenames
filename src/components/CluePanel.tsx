import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MAX_CLUE_LENGTH, validateClueWord } from '../../shared/clue';
import { MAX_CLUE_COUNT, type ClueCount, type MatchView, type PlayerView } from '../../shared/types';
import { act, upper } from '../store';
import { Button, Icon, useStrings } from './ui';

const COUNTS: ClueCount[] = [...Array.from({ length: MAX_CLUE_COUNT + 1 }, (_, i) => i), 'unlimited'];
const countLabel = (c: ClueCount) => (c === 'unlimited' ? '∞' : String(c));

/** Floating capsule at the bottom of the board, as in the reference design. */
export function CluePill({ match, me, teamLabel }: { match: MatchView; me: PlayerView | undefined; teamLabel: string }) {
  const s = useStrings();
  const myTurn = me?.team === match.turn;
  if (match.phase === 'finished') return null;

  if (match.phase === 'clue') {
    if (myTurn && me?.role === 'spymaster') return <ClueForm match={match} />;
    return (
      <div className={`cluepill cluepill--${match.turn} cluepill--waiting`} role="status">
        <span className="spinner" aria-hidden />
        <span>
          <strong>{teamLabel}</strong> · {s.phaseClue}
        </span>
      </div>
    );
  }

  const clue = match.clue!;
  const left = clue.maxGuesses === null ? null : clue.maxGuesses - clue.guessesMade;
  const canAct = myTurn && me?.role === 'operative';
  return (
    <div className={`cluepill cluepill--${clue.team}`} aria-live="polite">
      <span className="cluepill__label">
        <Icon name="bulb" /> {s.clue}
      </span>
      <span className="cluepill__word" lang={match.language}>
        {upper(clue.word, match.language)}
      </span>
      <span className="cluepill__count">{countLabel(clue.count)}</span>
      <span className="cluepill__meta">{s.guessesLeft(left)}</span>
      {canAct ? <EndGuessButton clueId={clue.id} disabled={clue.guessesMade < 1} /> : null}
    </div>
  );
}

function EndGuessButton({ clueId, disabled }: { clueId: number; disabled: boolean }) {
  const s = useStrings();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="gold"
        size="sm"
        icon="check"
        busy={busy}
        disabled={disabled}
        title={disabled ? s.endTurnHint : undefined}
        aria-describedby={disabled ? 'end-turn-hint' : undefined}
        onClick={async () => {
          setBusy(true);
          await act('game:endTurn', { clueId });
          setBusy(false);
        }}
      >
        {s.endGuess}
      </Button>
      {disabled ? (
        <span id="end-turn-hint" className="sr-only">
          {s.endTurnHint}
        </span>
      ) : null}
    </>
  );
}

function ClueForm({ match }: { match: MatchView }) {
  const s = useStrings();
  const [word, setWord] = useState('');
  const [countIdx, setCountIdx] = useState(1);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus without scrolling the board out of view.
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);
  const boardWords = useMemo(() => match.cards.filter((c) => !c.revealed).map((c) => c.word), [match.cards]);
  const count = COUNTS[countIdx];

  // Same validator the server uses, for instant feedback. The server re-checks.
  const check = word.trim() ? validateClueWord(word, boardWords, match.language) : null;
  const wordError = check && !check.ok ? check : null;
  const canSubmit = check?.ok === true && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const ok = await act('game:clue', { word, count });
    setBusy(false);
    if (ok) {
      setWord('');
      setCountIdx(1);
    }
  };

  return (
    <div className="clueform-wrap">
      {wordError ? (
        <p id="clue-error" className="clueform__error" role="alert">
          {s.errors[wordError.error]}
          {wordError.detail ? ` ${s.clueConflict(upper(wordError.detail, match.language))}` : ''}
        </p>
      ) : null}
      <form className={`cluepill cluepill--form cluepill--${match.turn}`} onSubmit={submit} noValidate>
        <span className="cluepill__label">
          <Icon name="bulb" /> {s.clue}
        </span>
        <input
          ref={inputRef}
          className={`cluepill__input ${wordError ? 'is-invalid' : ''}`}
          value={word}
          lang={match.language}
          maxLength={MAX_CLUE_LENGTH + 4}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={s.cluePlaceholder}
          aria-label={s.clue}
          aria-invalid={!!wordError}
          aria-describedby={wordError ? 'clue-error' : undefined}
          onChange={(e) => setWord(e.target.value)}
        />
        <span className="stepper" role="group" aria-label={`${s.clue}: ${count === 'unlimited' ? s.unlimited : count}`}>
          <button type="button" aria-label="−" disabled={countIdx === 0} onClick={() => setCountIdx((i) => Math.max(0, i - 1))}>
            <Icon name="minus" size={14} />
          </button>
          <output aria-live="polite">{countLabel(count)}</output>
          <button type="button" aria-label="+" disabled={countIdx === COUNTS.length - 1} onClick={() => setCountIdx((i) => Math.min(COUNTS.length - 1, i + 1))}>
            <Icon name="plus" size={14} />
          </button>
        </span>
        <Button type="submit" variant="gold" icon="send" busy={busy} disabled={!canSubmit}>
          {s.send}
        </Button>
      </form>
    </div>
  );
}
