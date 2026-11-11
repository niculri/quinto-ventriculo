import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { THUMB_PREFIX, buildCardIndexes, cardIndexCards, cardIndexKey } from '@qv/schema';
import type { CardIndex, CardIndexRecord, ContentBundle } from '@qv/schema';

/**
 * The card browser's indexes (plan step 3.3, ANK-6) as the targets write them: one compressed file per assessment,
 * named by the hash of its JSON (`browse/<assessment>/<hash>.json.gz`), with the thumbnails its notes name
 * (`cards/thumb/<hash>.webp`). Only the notes of the bundle are in them: a note that names IMAIOS never got here (the
 * importer leaves it out before rendering it), nor one of content/unpublished.json, so their thumbnails are not made.
 */
export interface PackedIndex {
  record: CardIndexRecord;
  /** Key in the image store. */
  key: string;
  /** The gzip of the JSON. */
  body: Buffer;
  /** Each thumbnail the index names, with the card image it is made from. */
  thumbs: Map<string, string>;
  index: CardIndex;
}

/** The first 32 hex characters of the sha256 of the index's JSON. */
const digest = (json: string) => createHash('sha256').update(json).digest('hex').slice(0, 32);

/**
 * The indexes of `assessments` (null: every assessment with cards in the bundle's decks). The JSON is built in a fixed
 * order, so the same notes always give the same file and the same key.
 */
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
      // `cards/thumb/<hash>.webp` is made from `cards/<hash>.webp` (thumbKeyOf).
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

/** Runs `work` over `items`, at most `limit` at a time (R2 answers a request in tens of ms: one by one is slow). */
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
