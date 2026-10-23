// Prints word-pack statistics and quality warnings. Exits non-zero on hard errors.
import { WORD_PACKS } from '../shared/words/index';
import { foldWord } from '../shared/text';

let failed = false;
for (const pack of Object.values(WORD_PACKS)) {
  const multiTag = pack.entries.filter((e) => e.tags.length > 1);
  console.log(`\n${pack.id}: ${pack.entries.length} distinct words`);
  const byTag = new Map<string, number>();
  for (const e of pack.entries) for (const t of e.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
  console.log('  per tag:', Object.fromEntries(byTag));
  if (multiTag.length) console.log(`  listed under several tags (merged): ${multiTag.map((e) => e.text).join(', ')}`);
  if (pack.issues.length) {
    failed = true;
    console.log('  ERRORS:');
    for (const issue of pack.issues) console.log('   -', issue);
  }
  // Soft warning: one word is a prefix (≥3 letters) of another. Such pairs are allowed,
  // but they cannot clue each other when they share a board.
  const folded = pack.entries.map((e) => foldWord(e.text, pack.language)).sort();
  const pairs: string[] = [];
  for (const a of folded) for (const b of folded) if (a !== b && a.length >= 4 && b.startsWith(a)) pairs.push(`${a}→${b}`);
  if (pairs.length) console.log(`  prefix pairs (info): ${pairs.join(', ')}`);
}
process.exit(failed ? 1 : 0);
