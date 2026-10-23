import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MAX_CLUE_LENGTH, validateClueWord } from '../../shared/clue';
import { MAX_CLUE_COUNT, type ClueCount, type MatchView, type PlayerView } from '../../shared/types';
import { act, upper } from '../store';
import { Button, useStrings } from './ui';

const COUNTS: ClueCount[] = [...Array.from({ length: MAX_CLUE_COUNT + 1 }, (_, i) => i), 'unlimited'];
const countLabel = (c: ClueCount) => (c === 'unlimited' ? '∞' : String(c));

export function CluePanel({ match, me }: { match: MatchView; me: PlayerView | undefined }) {
  const s = useStrings();
  const myTurn = me?.team === match.turn;
  const isSpy = me?.role === 'spymaster';

  if (match.phase === 'finished') return null;

  if (match.phase === 'clue') {
    if (myTurn && isSpy) return <ClueForm match={match} />;
    return (
      <div className={`clue-panel clue-panel--${match.turn} clue-panel--waiting`} role="status">
        <span className="spinner" aria-hidden />
        <span>{s.waitingClue(match.turn)}</span>
      </div>
    );
  }

  const clue = match.clue!;
  const left = clue.maxGuesses === null ? null : clue.maxGuesses - clue.guessesMade;
  const canAct = myTurn && me?.role === 'operative';
  return (
    <div className={`clue-panel clue-panel--${clue.team}`}>
      <div className="clue-display" aria-live="polite">
        <span className="clue-display__label">{s.currentClue}</span>
        <span className="clue-display__word" lang={match.language}>
          {upper(clue.word, match.language)}
        </span>
        <span className="clue-display__count">{countLabel(clue.count)}</span>
      </div>
      <div className="clue-panel__meta">
        <span>{s.guessesLeft(left)}</span>
        <span className="muted">· {s.guessesMade(clue.guessesMade)}</span>
      </div>
      <div className="clue-panel__action">
        {canAct ? (
          <>
            <span className="clue-panel__hint">{s.pickCard}</span>
            <EndTurnButton clueId={clue.id} disabled={clue.guessesMade < 1} />
          </>
        ) : (
          <span className="clue-panel__hint">{s.operativesGuessing(clue.team)}</span>
        )}
      </div>
    </div>
  );
}

function EndTurnButton({ clueId, disabled }: { clueId: number; disabled: boolean }) {
  const s = useStrings();
  const [busy, setBusy] = useState(false);
  return (
    <span className="end-turn">
      <Button
        variant="secondary"
        busy={busy}
        disabled={disabled}
        aria-describedby={disabled ? 'end-turn-hint' : undefined}
        onClick={async () => {
          setBusy(true);
          await act('game:endTurn', { clueId });
          setBusy(false);
        }}
      >
        {s.endTurn}
      </Button>
      {disabled ? (
        <span id="end-turn-hint" className="sr-only">
          {s.endTurnHint}
        </span>
      ) : null}
    </span>
  );
}

function ClueForm({ match }: { match: MatchView }) {
  const s = useStrings();
  const [word, setWord] = useState('');
  const [count, setCount] = useState<ClueCount | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus without scrolling the board out of view.
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);
  const boardWords = useMemo(() => match.cards.filter((c) => !c.revealed).map((c) => c.word), [match.cards]);

  // Same validator the server uses, for instant feedback. The server re-checks.
  const check = word.trim() ? validateClueWord(word, boardWords, match.language) : null;
  const wordError = check && !check.ok ? check : null;
  const canSubmit = check?.ok === true && count !== null && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setBusy(true);
    const ok = await act('game:clue', { word, count });
    setBusy(false);
    if (ok) {
      setWord('');
      setCount(null);
      setTouched(false);
    }
  };

  return (
    <form className={`clue-panel clue-panel--${match.turn} clue-form`} onSubmit={submit} noValidate>
      <div className="clue-form__head">
        <strong>{s.yourTurn}</strong>
        <span className="muted"> · {s.giveClue}</span>
      </div>
      <div className="clue-form__row">
        <label className="field clue-form__word">
          <span className="field__label">{s.clueWord}</span>
          <input
            className={`input input--clue ${wordError ? 'input--error' : ''}`}
            value={word}
            lang={match.language}
            maxLength={MAX_CLUE_LENGTH + 4}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={s.clueWordPlaceholder}
            aria-invalid={!!wordError}
            aria-describedby="clue-error"
            ref={inputRef}
            onChange={(e) => setWord(e.target.value)}
          />
        </label>
        <fieldset className="field clue-form__count">
          <legend className="field__label">{s.clueCount}</legend>
          <div className="count-picker">
            {COUNTS.map((c) => (
              <button
                key={String(c)}
                type="button"
                className={count === c ? 'is-active' : ''}
                aria-pressed={count === c}
                aria-label={c === 'unlimited' ? s.unlimited : String(c)}
                onClick={() => setCount(c)}
              >
                {countLabel(c)}
              </button>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant={match.turn} size="lg" busy={busy} disabled={!canSubmit} className="clue-form__submit">
          {s.send}
        </Button>
      </div>
      <p id="clue-error" className="form-error" role="alert">
        {wordError
          ? `${s.errors[wordError.error]}${wordError.detail ? ` ${s.clueConflict(upper(wordError.detail, match.language))}` : ''}`
          : touched && count === null
            ? s.clueCount
            : ''}
      </p>
    </form>
  );
}
