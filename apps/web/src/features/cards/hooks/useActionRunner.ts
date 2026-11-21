// Runs the table's actions and «Deshacer»: busy meanwhile, the progress read again, and a toast with what it did or a
// notice with why it could not.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { actionLabel } from '@qv/study';
import { studyKeys } from '../../progress/queries';
import { errorText } from '../../../shared/lib/errorText';
import type { StudyRepository } from '../../progress/api/repository';
import type { CardWrite } from '../api/cardWrites';
import { useCardWrite, useUndoWrite } from './useCardWrites';
import { cardsStrings } from '../strings';

type Undone = Awaited<ReturnType<StudyRepository['undo']>>;

// Outside the hook: React Compiler does not compile a conditional inside `try`.
function undoneText(done: Undone, full: boolean) {
  return done
    ? cardsStrings.toasts.undone(actionLabel(done.action, full))
    : cardsStrings.toasts.nothingToUndo;
}

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
      setProblem(errorText(e, cardsStrings.toasts.failed));
    }
    setBusy(false);
  };
  const undo = () =>
    void (async () => {
      setBusy(true);
      setProblem(null);
      try {
        const done = await undoWrite.mutateAsync();
        await client.invalidateQueries({ queryKey: studyKeys.all });
        setToast(undoneText(done, full));
      } catch (e) {
        setProblem(errorText(e, cardsStrings.toasts.undoFailed));
      }
      setBusy(false);
    })();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  return { busy, toast, problem, act, undo };
}
