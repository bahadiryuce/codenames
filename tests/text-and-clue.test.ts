import { describe, expect, it } from 'vitest';
import { maxGuessesFor, validateClueCount, validateClueWord } from '../shared/clue';
import { cleanName, foldWord, normalizeWord, toLower, toUpper } from '../shared/text';
import { buildPack, WORD_PACKS } from '../shared/words/index';

describe('Turkish text handling', () => {
  it('maps dotted and dotless I correctly', () => {
    expect(toUpper('istanbul', 'tr')).toBe('İSTANBUL');
    expect(toUpper('ılık', 'tr')).toBe('ILIK');
    expect(toLower('IŞIK', 'tr')).toBe('ışık');
    expect(toLower('İZMİR', 'tr')).toBe('izmir');
    // English keeps default rules.
    expect(toUpper('ice', 'en')).toBe('ICE');
    expect(toLower('ICE', 'en')).toBe('ice');
  });

  it('normalises decomposed Unicode to the same form', () => {
    const decomposed = 'köpek'; // o + combining diaeresis
    expect(normalizeWord(decomposed, 'tr')).toBe('köpek');
    expect(foldWord('KÖPEK', 'tr')).toBe('kopek');
    expect(foldWord('kopek', 'tr')).toBe(foldWord('köpek', 'tr'));
    expect(foldWord('ılık', 'tr')).toBe('ilik');
  });

  it('cleans display names', () => {
    expect(cleanName('  Ayşe   Nur ')).toBe('Ayşe Nur');
    expect(cleanName('a​b')).toBe('ab');
    expect(cleanName('')).toBeNull();
    expect(cleanName('x'.repeat(21))).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});

describe('clue validation', () => {
  const board = ['köpek', 'kale', 'kitap', 'ağaç', 'renk', 'ışık', 'deniz'];
  const check = (w: string) => validateClueWord(w, board, 'tr');

  it('accepts ordinary single words in any case', () => {
    expect(check('Hayvan')).toEqual({ ok: true, word: 'hayvan' });
    expect(check('İLAÇ')).toEqual({ ok: true, word: 'ilaç' });
  });

  it('rejects empty, multi-word, punctuated or numeric clues', () => {
    expect(check('   ')).toMatchObject({ ok: false, error: 'CLUE_EMPTY' });
    expect(check('su altı')).toMatchObject({ ok: false, error: 'CLUE_NOT_ONE_WORD' });
    expect(check('su-altı')).toMatchObject({ ok: false, error: 'CLUE_BAD_CHARS' });
    expect(check("ada'da")).toMatchObject({ ok: false, error: 'CLUE_BAD_CHARS' });
    expect(check('hayvan3')).toMatchObject({ ok: false, error: 'CLUE_BAD_CHARS' });
    expect(check('hay.van')).toMatchObject({ ok: false, error: 'CLUE_BAD_CHARS' });
    expect(check('кот')).toMatchObject({ ok: false, error: 'CLUE_BAD_CHARS' });
    expect(check('a'.repeat(25))).toMatchObject({ ok: false, error: 'CLUE_TOO_LONG' });
  });

  it('rejects board words including case and diacritic variants', () => {
    expect(check('KÖPEK')).toMatchObject({ ok: false, error: 'CLUE_BOARD_WORD', detail: 'köpek' });
    expect(check('kopek')).toMatchObject({ ok: false, error: 'CLUE_BOARD_WORD' });
    expect(check('IŞIK')).toMatchObject({ ok: false, error: 'CLUE_BOARD_WORD' });
  });

  it('rejects forms of board words, including Turkish consonant softening', () => {
    expect(check('kaleci')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM', detail: 'kale' });
    expect(check('köpekler')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' });
    expect(check('kitabı')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM', detail: 'kitap' });
    expect(check('ağacı')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' });
    expect(check('rengi')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' });
    expect(check('denizaltı')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' });
    expect(check('kit')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' }); // root of a board word
  });

  it('only checks unrevealed words passed in', () => {
    expect(validateClueWord('kale', ['köpek'], 'tr')).toEqual({ ok: true, word: 'kale' });
  });

  it('handles English compounds and plurals', () => {
    expect(validateClueWord('horses', ['horse'], 'en')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' });
    expect(validateClueWord('shoe', ['horseshoe'], 'en')).toMatchObject({ ok: false, error: 'CLUE_WORD_FORM' });
    expect(validateClueWord('animal', ['horse'], 'en')).toEqual({ ok: true, word: 'animal' });
  });

  it('validates counts and guess limits', () => {
    for (const ok of [0, 1, 5, 9, 'unlimited']) expect(validateClueCount(ok)).toBe(true);
    for (const bad of [-1, 10, 2.5, '3', null, undefined, NaN, 'inf']) expect(validateClueCount(bad)).toBe(false);
    expect(maxGuessesFor(1)).toBe(2);
    expect(maxGuessesFor(9)).toBe(10);
    expect(maxGuessesFor(0)).toBeNull();
    expect(maxGuessesFor('unlimited')).toBeNull();
  });
});

describe('word packs', () => {
  it('ships a clean Turkish pack of at least 500 words and a separate English pack', () => {
    const tr = WORD_PACKS.tr;
    const en = WORD_PACKS.en;
    expect(tr.issues).toEqual([]);
    expect(en.issues).toEqual([]);
    expect(tr.entries.length).toBeGreaterThanOrEqual(500);
    expect(en.entries.length).toBeGreaterThanOrEqual(400);
    expect(new Set(tr.entries.map((e) => e.folded)).size).toBe(tr.entries.length);
    expect(tr.entries.every((e) => e.language === 'tr' && e.text === normalizeWord(e.text, 'tr'))).toBe(true);
    expect(en.entries.every((e) => /^[a-z]+$/.test(e.text))).toBe(true);
  });

  it('reports malformed entries and folded collisions', () => {
    const pack = buildPack('t', 'tr', { a: 'çam cam ok ok uzunbirkelimeburada x-y' });
    expect(pack.entries.map((e) => e.text)).toEqual(['çam', 'ok']);
    expect(pack.issues).toHaveLength(3);
  });
});
