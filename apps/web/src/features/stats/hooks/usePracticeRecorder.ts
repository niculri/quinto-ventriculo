// Records the practice answers of the final review for the heatmap, in batches the database takes (by hand, not with
// `useMutation`: `mutate()` would call the repository a microtask later, and on `pagehide` the page may be gone).
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
