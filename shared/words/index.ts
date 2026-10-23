import { foldWord, normalizeWord } from '../text';
import type { Language } from '../types';
import { EN_WORDS } from './en';
import { TR_WORDS } from './tr';

export interface WordEntry {
  /** Display form (lowercase; uppercase it with toUpper(text, language) for the board). */
  text: string;
  /** Exact comparison form. */
  normalized: string;
  /** Loose comparison form (diacritics folded). Unique within a pack. */
  folded: string;
  language: Language;
  tags: string[];
}

export interface WordPack {
  id: string;
  language: Language;
  entries: WordEntry[];
  /** Problems found while building; empty for a clean pack. */
  issues: string[];
}

export const MAX_WORD_LENGTH = 11;

const LETTERS = /^\p{Script=Latin}+$/u;

/**
 * Builds a pack from tag → whitespace-separated words. Entries that repeat across tags
 * are merged (their tags are combined). Malformed entries and folded collisions
 * (e.g. "kopek" vs "köpek") are dropped and reported in `issues`.
 */
export function buildPack(id: string, language: Language, source: Record<string, string>): WordPack {
  const byFolded = new Map<string, WordEntry>();
  const issues: string[] = [];
  for (const [tag, block] of Object.entries(source)) {
    for (const raw of block.split(/\s+/).filter(Boolean)) {
      const normalized = normalizeWord(raw, language);
      if (!LETTERS.test(normalized)) {
        issues.push(`invalid characters: "${raw}" (${tag})`);
        continue;
      }
      if ([...normalized].length > MAX_WORD_LENGTH) {
        issues.push(`too long: "${raw}" (${tag})`);
        continue;
      }
      const folded = foldWord(normalized, language);
      const existing = byFolded.get(folded);
      if (existing) {
        if (existing.normalized !== normalized) {
          issues.push(`folded collision: "${existing.text}" vs "${raw}"`);
        } else if (!existing.tags.includes(tag)) {
          existing.tags.push(tag);
        }
        continue;
      }
      byFolded.set(folded, { text: normalized, normalized, folded, language, tags: [tag] });
    }
  }
  return { id, language, entries: [...byFolded.values()], issues };
}

export const WORD_PACKS: Record<Language, WordPack> = {
  tr: buildPack('tr-standard', 'tr', TR_WORDS),
  en: buildPack('en-standard', 'en', EN_WORDS),
};

export function wordsFor(language: Language): string[] {
  return WORD_PACKS[language].entries.map((e) => e.text);
}
