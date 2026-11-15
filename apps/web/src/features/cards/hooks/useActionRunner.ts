// Runs the table's actions and «Deshacer» on the repository at once (not with `useMutation`, a few microtasks later):
// busy meanwhile, the progress read again, and a toast with what it did or a notice with why it could not.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { actionLabel } from '@qv/study';
import { useStudyRepository } from '../../progress/api/context';
import { studyKeys } from '../../progress/queries';

export function useActionRunner(full: boolean) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const act = async (what: string, run: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await run();
      await client.invalidateQueries({ queryKey: studyKeys.all });
      setToast(what);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'No se pudo hacer.');
    } finally {
      setBusy(false);
    }
  };
  const undo = () =>
    void (async () => {
      setBusy(true);
      setProblem(null);
      try {
        const done = await study.undo();
        await client.invalidateQueries({ queryKey: studyKeys.all });
        setToast(done ? `Deshecho: ${actionLabel(done.action, full)}` : 'No hay nada que deshacer');
      } catch (e) {
        setProblem(e instanceof Error ? e.message : 'No se pudo deshacer.');
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
