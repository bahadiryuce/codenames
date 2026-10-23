import type { Language } from './types';

// Language-aware case mapping. JavaScript's default toLowerCase()/toUpperCase() map
// I→i and i→I, which is wrong for Turkish (I↔ı, İ↔i). We map those four letters
// explicitly before delegating, so results do not depend on the runtime's ICU data.

export function toLower(input: string, lang: Language): string {
  const s = input.normalize('NFC');
  if (lang !== 'tr') return s.toLowerCase();
  return s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

export function toUpper(input: string, lang: Language): string {
  const s = input.normalize('NFC');
  if (lang !== 'tr') return s.toUpperCase();
  return s.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/** Canonical comparison form: NFC, trimmed, language-aware lowercase. Keeps ç/ş/ğ/ö/ü/ı distinct. */
export function normalizeWord(input: string, lang: Language): string {
  return toLower(input.trim(), lang);
}

/**
 * Loose comparison form used to catch look-alike spellings: "kopek" for "köpek",
 * "KOPEK", "köpek" typed with decomposed diacritics, etc. Decomposing (NFD) and
 * dropping combining marks turns ç ş ğ ö ü â î û into their base letters; dotless ı
 * has no decomposition, so it is mapped by hand.
 */
export function foldWord(input: string, lang: Language): string {
  return normalizeWord(input, lang)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i');
}

/** Display names: NFC, collapse whitespace, strip control/format characters. */
export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 1 || [...s].length > 20) return null;
  return s;
}
