import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Identity, MatchView } from '../../shared/types';
import { act, upper } from '../store';
import { CardArt } from './CardArt';
import { AgentMark, Icon, useStrings } from './ui';

interface CardData {
  word: string;
  revealed: boolean;
  identity: Identity | null;
}

const COLS = 5;

export function Board({
  match,
  canGuess,
  isSpymaster,
  identityLabel,
  myName,
}: {
  match: MatchView;
  canGuess: boolean;
  isSpymaster: boolean;
  identityLabel: (id: Identity) => string;
  myName: string;
}) {
  const s = useStrings();
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cards = match.cards as CardData[];
  const clueId = match.clue?.id ?? null;
  const finished = match.phase === 'finished';

  // Selection is only meaningful within the current clue; drop it when anything moves on.
  useEffect(() => {
    setSelected(null);
    setPending(null);
  }, [clueId, canGuess]);
  useEffect(() => {
    if (selected !== null && cards[selected]?.revealed) setSelected(null);
    if (pending !== null && cards[pending]?.revealed) setPending(null);
  }, [cards, selected, pending]);

  const reveal = async (i: number) => {
    if (clueId === null || pending !== null) return;
    setPending(i);
    const ok = await act('game:guess', { index: i, clueId });
    if (!ok) setPending(null);
    setSelected(null);
  };

  const onActivate = (i: number) => {
    if (!canGuess || cards[i].revealed || pending !== null) return;
    if (selected === i) void reveal(i);
    else setSelected(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    if (e.key in moves) {
      e.preventDefault();
      const next = Math.min(cards.length - 1, Math.max(0, focus + moves[e.key]));
      setFocus(next);
      refs.current[next]?.focus();
    } else if (e.key === 'Escape') {
      setSelected(null);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : cards.length - 1;
      setFocus(next);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      className={`board ${isSpymaster && !finished ? 'board--key' : ''} ${finished ? 'board--finished' : ''} ${canGuess ? 'board--active' : ''}`}
      role="group"
      aria-label={match.language === 'tr' ? 'Oyun tahtası' : 'Game board'}
      onKeyDown={onKeyDown}
    >
      {cards.map((card, i) => {
        const word = upper(card.word, match.language);
        const selectable = canGuess && !card.revealed && pending === null;
        const isSelected = selected === i;
        const id = card.identity;
        const marks = match.marks?.[i] ?? [];
        const iMarked = marks.includes(myName);
        const tone = card.revealed ? id : id ?? 'down';
        const classes = [
          'wcard',
          `wcard--${card.revealed ? `open-${id}` : id ? `key-${id}` : 'down'}`,
          card.revealed ? 'wcard--revealed' : '',
          selectable ? 'wcard--selectable' : '',
          isSelected ? 'wcard--selected' : '',
          pending === i ? 'wcard--pending' : '',
          marks.length ? 'wcard--marked' : '',
        ].join(' ');
        const status = card.revealed ? identityLabel(id!) : id ? `${identityLabel(id)}, ${s.hidden.toLowerCase()}` : s.hidden;
        return (
          <div key={i} className={classes} data-tone={tone}>
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              className="wcard__face"
              style={{ ['--chars' as string]: Math.max(5, [...word].length) }}
              tabIndex={focus === i ? 0 : -1}
              aria-disabled={!selectable}
              aria-pressed={canGuess ? isSelected : undefined}
              aria-label={`${word}. ${status}.${marks.length ? ` ${marks.join(', ')}.` : ''} ${isSelected ? s.selectedAria(word) : selectable ? s.revealAria(word) : ''}`}
              onFocus={() => setFocus(i)}
              onClick={() => onActivate(i)}
            >
              {card.revealed && id ? (
                <CardArt identity={id} seed={i} />
              ) : (
                <span className="wcard__mark" aria-hidden>
                  <AgentMark size={18} />
                  <span>PAROLA</span>
                </span>
              )}
              <span className="wcard__plate">
                <span className="wcard__word" lang={match.language}>
                  {word}
                </span>
              </span>
              {isSelected ? (
                <span className="wcard__confirm" aria-hidden>
                  {s.confirmReveal}
                </span>
              ) : null}
              {pending === i ? <span className="wcard__spinner spinner" aria-hidden /> : null}
            </button>
            {canGuess && !card.revealed ? (
              <button
                type="button"
                className={`wcard__check ${iMarked ? 'is-on' : ''}`}
                aria-label={`${iMarked ? s.unmark : s.mark}: ${word}`}
                aria-pressed={iMarked}
                onClick={() => clueId !== null && void act('game:mark', { index: i, clueId })}
              >
                <Icon name="check" size={12} />
              </button>
            ) : null}
            {marks.length ? (
              <span className="wcard__tags" aria-hidden>
                {marks.slice(0, 2).map((n) => (
                  <span key={n} className="wcard__tag">
                    {n}
                  </span>
                ))}
                {marks.length > 2 ? <span className="wcard__tag">+{marks.length - 2}</span> : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
