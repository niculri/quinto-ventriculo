// The viewer's actions on its card: mark it and hide it, shown at once and undone if saving fails; the repository is
// called right after (not with `useMutation`, a few microtasks later), and a message says how it went.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CardSummary } from '@qv/schema';
import { useStudyRepository } from '../../progress/api/context';
import { studyKeys } from '../../progress/queries';
import type { BrowseCard } from '../model/browseCards';

const REVIEW_FLAG = 1;

export function useViewerActions(card: CardSummary, info: BrowseCard | undefined) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const [flag, setFlag] = useState(info?.flag ?? 0);
  const [hidden, setHidden] = useState(info?.queue === 'suspended');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(id);
  }, [message]);
  const ref = { noteGuid: card.noteGuid, ord: card.ord, deckId: card.deckId };
  const run = async (what: () => Promise<unknown>, done: string, undo: () => void) => {
    setBusy(true);
    try {
      await what();
      setMessage(done);
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch {
      undo();
      setMessage('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  const toggleFlag = () => {
    const before = flag;
    const next = flag ? 0 : REVIEW_FLAG;
    setFlag(next);
    void run(
      () => study.setFlag(ref, next),
      next ? 'Marcada para revisar' : 'Sin marca',
      () => setFlag(before),
    );
  };
  const toggleHidden = () => {
    const before = hidden;
    setHidden(!hidden);
    void run(
      () => (before ? study.unsuspend([ref]) : study.suspend([ref], false)),
      before ? 'Se mostrará de nuevo' : 'No se mostrará más',
      () => setHidden(before),
    );
  };
  return { ref, flag, hidden, busy, message, setMessage, toggleFlag, toggleHidden };
}
