// Records the practice answers of the final review for the heatmap, in batches the database takes (by hand, not with
// `useMutation`: `mutate()` would move each call a microtask later, after the rest of the event or cleanup that flushes).
import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudyRepository } from '../../progress/api/context';
import {
  PRACTICE_BATCH_DECKS,
  PRACTICE_BATCH_MAX,
  PracticeRefusedError,
} from '../../progress/api/repository';
import { heatmapKeys } from '../api/queries';
import { practiceBatches } from '../api/practiceBatches';

const PRACTICE_BATCH = 10;

// A batch that fails for the network goes with the next one (up to one database batch); one the database refuses
// is not sent again.
export function usePracticeRecorder(batch = PRACTICE_BATCH) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const pendingRef = useRef(new Map<string, number>());
  const sizeRef = useRef(0);
  const aliveRef = useRef(true);

  // The cleanup of an effect flushes with it, and the pages' effects depend on it.
  const flush = useCallback(() => {
    if (!pendingRef.current.size) return;
    const counts = [...pendingRef.current].map(([deckId, n]) => ({ deckId, n }));
    pendingRef.current = new Map();
    sizeRef.current = 0;
    for (const part of practiceBatches(counts)) {
      void study.recordPractice(part).then(
        () => client.invalidateQueries({ queryKey: heatmapKeys.all }),
        (e: unknown) => {
          if (!aliveRef.current || e instanceof PracticeRefusedError) return;
          for (const { deckId, n } of part) {
            // What waits is never more than a batch the database takes.
            const keep = Math.min(n, PRACTICE_BATCH_MAX - sizeRef.current);
            if (keep <= 0) break;
            if (!pendingRef.current.has(deckId) && pendingRef.current.size >= PRACTICE_BATCH_DECKS)
              break;
            pendingRef.current.set(deckId, (pendingRef.current.get(deckId) ?? 0) + keep);
            sizeRef.current += keep;
          }
        },
      );
    }
  }, [client, study]);

  const add = (deckId: string) => {
    pendingRef.current.set(deckId, (pendingRef.current.get(deckId) ?? 0) + 1);
    sizeRef.current++;
    if (sizeRef.current >= batch) flush();
  };

  useEffect(() => {
    aliveRef.current = true;
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
      flush();
    };
  }, [flush]);

  return { add, flush };
}
