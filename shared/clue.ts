import { foldWord, normalizeWord } from './text';
import { MAX_CLUE_COUNT, type ClueCount, type ErrorCode, type Language } from './types';

// Deterministic clue validation. This is a baseline, not a morphological analyser:
//
//  1. A clue is a single run of Latin-script letters (after Unicode NFC normalisation).
//     Spaces, digits, hyphens, apostrophes and other punctuation are rejected, which
//     also rules out "two words glued with punctuation" tricks.
//  2. It may not equal any unrevealed board word, compared in folded form so that
//     KÖPEK / köpek / kopek are all treated as the same word.
//  3. It may not look like a form of an unrevealed board word:
//       - one starts with the other and the shorter is at least 3 letters
//         (kale → kaleci, kitap → kitaplık, horse → horses);
//       - one contains the other and the shorter is at least 4 letters
//         (horseshoe ↔ shoe, ayakkabı ↔ kabı);
//       - Turkish final-consonant softening is applied to board words first
//         (kitap → kitab-ı, ağaç → ağac-ı, renk → reng-i, kanat → kanad-ı).
//
// Known limitations (documented in README): vowel-dropping stems (ağız → ağzı,
// burun → burnu) are not detected; short stems (≤ 2 letters, e.g. "su") are not
// checked for derivations; and unrelated words that happen to share a 3+ letter
// prefix with a board word (kar → karpuz) are rejected as a conservative trade-off.

export const MAX_CLUE_LENGTH = 24;
const PREFIX_MIN = 3;
const CONTAINS_MIN = 4;

export type ClueCheck =
  | { ok: true; word: string }
  | { ok: false; error: ErrorCode; detail?: string };

function stemVariants(folded: string, lang: Language): string[] {
  const variants = [folded];
  if (lang === 'tr') {
    // Folded forms have ç→c, ğ→g, so softening p/ç/t/k gives b/c/d/g.
    const soft: Record<string, string> = { p: 'b', c: 'c', t: 'd', k: 'g' };
    const last = folded.at(-1) ?? '';
    if (last in soft && folded.length >= 3) variants.push(folded.slice(0, -1) + soft[last]);
  }
  return [...new Set(variants)];
}

function isFormOf(clue: string, board: string): boolean {
  const [shorter, longer] = clue.length <= board.length ? [clue, board] : [board, clue];
  if (shorter.length >= PREFIX_MIN && longer.startsWith(shorter)) return true;
  if (shorter.length >= CONTAINS_MIN && longer.includes(shorter)) return true;
  return false;
}

export function validateClueWord(raw: unknown, boardWords: readonly string[], lang: Language): ClueCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'CLUE_EMPTY' };
  const word = normalizeWord(raw, lang);
  if (word.length === 0) return { ok: false, error: 'CLUE_EMPTY' };
  if ([...word].length > MAX_CLUE_LENGTH) return { ok: false, error: 'CLUE_TOO_LONG' };
  if (/\s/u.test(word)) return { ok: false, error: 'CLUE_NOT_ONE_WORD' };
  if (!/^\p{Script=Latin}+$/u.test(word) || /[\p{N}\p{P}\p{S}]/u.test(word)) {
    return { ok: false, error: 'CLUE_BAD_CHARS' };
  }

  const folded = foldWord(word, lang);
  for (const boardWord of boardWords) {
    const boardFolded = foldWord(boardWord, lang);
    if (folded === boardFolded) return { ok: false, error: 'CLUE_BOARD_WORD', detail: boardWord };
  }
  for (const boardWord of boardWords) {
    for (const variant of stemVariants(foldWord(boardWord, lang), lang)) {
      if (isFormOf(folded, variant)) return { ok: false, error: 'CLUE_WORD_FORM', detail: boardWord };
    }
  }
  return { ok: true, word };
}

export function validateClueCount(raw: unknown): raw is ClueCount {
  if (raw === 'unlimited') return true;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MAX_CLUE_COUNT;
}

/** Official rule: count + 1 guesses; 0 and unlimited place no cap (at least one guess still required). */
export function maxGuessesFor(count: ClueCount): number | null {
  if (count === 'unlimited' || count === 0) return null;
  return count + 1;
}
