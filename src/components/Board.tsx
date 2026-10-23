import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Identity, MatchView } from '../../shared/types';
import { act, upper } from '../store';
import { Glyph, useStrings } from './ui';

interface CardData {
  word: string;
  revealed: boolean;
  identity: Identity | null;
}

const COLS = 5;

export function Board({ match, canGuess, isSpymaster }: { match: MatchView; canGuess: boolean; isSpymaster: boolean }) {
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
        const classes = [
          'card',
          card.revealed ? `card--revealed card--${id}` : 'card--down',
          !card.revealed && id ? `card--key card--key-${id}` : '',
          selectable ? 'card--selectable' : '',
          isSelected ? 'card--selected' : '',
          pending === i ? 'card--pending' : '',
        ].join(' ');
        const status = card.revealed ? `${s.identity[id!]}` : id ? `${s.identity[id]}, ${s.hidden.toLowerCase()}` : s.hidden;
        return (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className={classes}
            style={{ ['--chars' as string]: Math.max(5, [...word].length) }}
            tabIndex={focus === i ? 0 : -1}
            aria-disabled={!selectable}
            aria-pressed={canGuess ? isSelected : undefined}
            aria-label={`${word}. ${status}. ${isSelected ? s.selectedAria(word) : selectable ? s.revealAria(word) : ''}`}
            onFocus={() => setFocus(i)}
            onClick={() => onActivate(i)}
          >
            <span className="card__inner">
              {id ? (
                <span className="card__mark">
                  <Glyph identity={id} size={card.revealed ? 22 : 13} />
                </span>
              ) : null}
              <span className="card__word" lang={match.language}>
                {word}
              </span>
            </span>
            {isSelected ? (
              <span className="card__confirm" aria-hidden>
                {s.confirmReveal}
              </span>
            ) : null}
            {pending === i ? <span className="card__spinner spinner" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
