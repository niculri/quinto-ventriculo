// Records the practice answers of the final review for the heatmap, in batches the database takes (by hand, not with
// `useMutation`: `mutate()` would move each call a microtask later, after the rest of the event or cleanup that flushes).
import { useEffect, useEffectEvent, useRef } from 'react';
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
// is not sent again. What is waiting also goes when `finished` turns true, the page is hidden and the page closes.
export function usePracticeRecorder(finished: boolean, batch = PRACTICE_BATCH) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const pendingRef = useRef(new Map<string, number>());
  const sizeRef = useRef(0);
  const aliveRef = useRef(true);

  const flush = () => {
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
  };

  const add = (deckId: string) => {
    pendingRef.current.set(deckId, (pendingRef.current.get(deckId) ?? 0) + 1);
    sizeRef.current++;
    if (sizeRef.current >= batch) flush();
  };

  // The effects flush with whatever the latest render has, and do not run again when it changes.
  const flushNow = useEffectEvent(flush);

  useEffect(() => {
    if (finished) flushNow();
  }, [finished]);

  useEffect(() => {
    aliveRef.current = true;
    const hidden = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', hidden);
      flushNow();
    };
  }, []);

  return { add };
}
