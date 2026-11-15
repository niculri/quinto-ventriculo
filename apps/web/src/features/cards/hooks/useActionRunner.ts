// Runs the table's actions and «Deshacer»: busy meanwhile, the progress read again, and a toast with what it did or a
// notice with why it could not.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { actionLabel } from '@qv/study';
import { studyKeys } from '../../progress/queries';
import type { CardWrite } from '../api/cardWrites';
import { useCardWrite, useUndoWrite } from './useCardWrites';
import { cardsStrings } from '../strings';

export function useActionRunner(full: boolean) {
  const write = useCardWrite();
  const undoWrite = useUndoWrite();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const act = async (what: string, w: CardWrite) => {
    setBusy(true);
    setProblem(null);
    try {
      await write.mutateAsync(w);
      await client.invalidateQueries({ queryKey: studyKeys.all });
      setToast(what);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : cardsStrings.toasts.failed);
    } finally {
      setBusy(false);
    }
  };
  const undo = () =>
    void (async () => {
      setBusy(true);
      setProblem(null);
      try {
        const done = await undoWrite.mutateAsync();
        await client.invalidateQueries({ queryKey: studyKeys.all });
        setToast(
          done
            ? cardsStrings.toasts.undone(actionLabel(done.action, full))
            : cardsStrings.toasts.nothingToUndo,
        );
      } catch (e) {
        setProblem(e instanceof Error ? e.message : cardsStrings.toasts.undoFailed);
      } finally {
        setBusy(false);
      }
    })();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  return { busy, toast, problem, act, undo };
}
