// Packs the card browser's indexes: one gzipped JSON per assessment (`browse/<assessment>/<hash>.json.gz`), with the
// thumbnails its notes name.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { THUMB_PREFIX, buildCardIndexes, cardIndexCards, cardIndexKey } from '@qv/schema';
import type { CardIndex, CardIndexRecord, ContentBundle } from '@qv/schema';

export interface PackedIndex {
  record: CardIndexRecord;
  key: string;
  body: Buffer;
  /** Thumbnail key → the key of the card image it is made from. */
  thumbs: Map<string, string>;
  index: CardIndex;
}

const digest = (json: string) => createHash('sha256').update(json).digest('hex').slice(0, 32);

/** The JSON is built in a fixed order, so the same notes always give the same file and key. */
export function packCardIndexes(
  bundle: Pick<ContentBundle, 'ankiNoteTypes' | 'ankiDecks' | 'ankiNotes'>,
  assessments: readonly string[] | null = null,
): PackedIndex[] {
  return buildCardIndexes({
    noteTypes: bundle.ankiNoteTypes,
    decks: bundle.ankiDecks,
    notes: bundle.ankiNotes,
    ...(assessments ? { assessments } : {}),
  }).map((index) => {
    const json = JSON.stringify(index);
    const hash = digest(json);
    const body = gzipSync(json, { level: 9 });
    const thumbs = new Map<string, string>();
    for (const n of index.notes) {
      if (n.thumb) thumbs.set(n.thumb, n.thumb.replace(THUMB_PREFIX, 'cards/'));
    }
    return {
      record: {
        assessmentId: index.assessmentId,
        hash,
        noteCount: index.notes.length,
        cardCount: cardIndexCards(index),
        bytes: body.length,
      },
      key: cardIndexKey(index.assessmentId, hash),
      body,
      thumbs,
      index,
    };
  });
}

export async function inPool<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await work(item);
    }
  });
  await Promise.all(runners);
}
