import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import {
  PRACTICE_BATCH_DECKS,
  PRACTICE_BATCH_MAX,
  PracticeRefusedError,
} from '../study/repository';
import type { PracticeCount } from '../study/repository';
import { heatmapKeys } from './queries';

/** How many answers of practice go in a batch: few, so that leaving the page loses almost nothing. */
export const PRACTICE_BATCH = 10;

/** The counts in batches within the database's caps: at most PRACTICE_BATCH_MAX answers and PRACTICE_BATCH_DECKS decks. */
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

/**
 * Practice that does not change dates (the final review) counts in the heatmap and the streak (decision 19): each
 * answer adds one to its deck, and the counts go to the database in batches (every few answers, at the end of a round
 * and when leaving the page), never touching the cards' states nor the log. A batch that fails for the network goes
 * with the next one (up to the size of one batch of the database); one the database refuses is not sent again. Past
 * PRACTICE_DAY_MAX in a day the database counts nothing more without failing, so there is nothing to retry.
 */
export function usePracticeRecorder(batch = PRACTICE_BATCH) {
  const { study } = useServices();
  const client = useQueryClient();
  const pending = useRef(new Map<string, number>());
  const size = useRef(0);
  const alive = useRef(true);

  const flush = useCallback(() => {
    if (!pending.current.size) return;
    const counts = [...pending.current].map(([deckId, n]) => ({ deckId, n }));
    pending.current = new Map();
    size.current = 0;
    for (const part of practiceBatches(counts)) {
      void study.recordPractice(part).then(
        () => client.invalidateQueries({ queryKey: heatmapKeys.all }),
        (e: unknown) => {
          if (!alive.current || e instanceof PracticeRefusedError) return;
          for (const { deckId, n } of part) {
            // What waits is never more than a batch the database takes.
            const keep = Math.min(n, PRACTICE_BATCH_MAX - size.current);
            if (keep <= 0) break;
            if (!pending.current.has(deckId) && pending.current.size >= PRACTICE_BATCH_DECKS) break;
            pending.current.set(deckId, (pending.current.get(deckId) ?? 0) + keep);
            size.current += keep;
          }
        },
      );
    }
  }, [client, study]);

  const add = useCallback(
    (deckId: string) => {
      pending.current.set(deckId, (pending.current.get(deckId) ?? 0) + 1);
      size.current++;
      if (size.current >= batch) flush();
    },
    [batch, flush],
  );

  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
      flush();
    };
  }, [flush]);

  return { add, flush };
}
