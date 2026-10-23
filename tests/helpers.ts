import type { RandomInt } from '../shared/engine';

/** Deterministic RNG (mulberry32) for reproducible tests. */
export function seeded(seed: number): RandomInt {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

export const TEST_WORDS = [
  'elma', 'armut', 'kiraz', 'çilek', 'muz', 'kale', 'kule', 'köprü', 'gemi', 'tren',
  'kedi', 'köpek', 'aslan', 'kaplan', 'kartal', 'deniz', 'dağ', 'orman', 'nehir', 'göl',
  'saat', 'ayna', 'kapı', 'pencere', 'lamba',
];
