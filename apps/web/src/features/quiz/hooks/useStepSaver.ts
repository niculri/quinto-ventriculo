// The saver of a section's steps (`api/saver.ts`), its state for the page, and the browser's «leave?» while it saves.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { QuizRepository } from '../api/repository';
import { StepSaver } from '../api/StepSaver';

export function useStepSaver(repository: QuizRepository) {
  const [saver] = useState(() => new StepSaver(repository));
  const status = useSyncExternalStore(
    // A new function would subscribe again in each render.
    useCallback((fn) => saver.subscribe(fn), [saver]),
    () => (saver.failed ? 'failed' : saver.pending ? 'saving' : 'saved'),
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.pending) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saver]);

  return { saver, status };
}
