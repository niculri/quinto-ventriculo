// The practice answers of the final review, cut in batches the database takes.
import { PRACTICE_BATCH_DECKS, PRACTICE_BATCH_MAX } from '../../progress/api/repository';
import type { PracticeCount } from '../../progress/api/repository';

export function practiceBatches(counts: readonly PracticeCount[]): PracticeCount[][] {
  const out: PracticeCount[][] = [];
  let batch: PracticeCount[] = [];
  let size = 0;
  for (const { deckId, n: all } of counts) {
    let n = all;
    while (n > 0) {
      if (size === PRACTICE_BATCH_MAX || batch.length === PRACTICE_BATCH_DECKS) {
        out.push(batch);
        batch = [];
        size = 0;
      }
      const part = Math.min(n, PRACTICE_BATCH_MAX - size);
      batch.push({ deckId, n: part });
      size += part;
      n -= part;
    }
  }
  if (batch.length) out.push(batch);
  return out;
}
