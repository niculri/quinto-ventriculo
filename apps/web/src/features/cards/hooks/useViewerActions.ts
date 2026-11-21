// The viewer's actions on its card: mark it and hide it, shown at once and undone if saving fails, and a message that
// says how it went.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CardSummary } from '@qv/schema';
import { studyKeys } from '../../progress/queries';
import type { BrowseCard } from '../model/browseCards';
import type { CardWrite } from '../api/cardWrites';
import { useCardWrite } from './useCardWrites';
import { cardsStrings } from '../strings';

const REVIEW_FLAG = 1;

export function useViewerActions(card: CardSummary, info: BrowseCard | undefined) {
  const write = useCardWrite();
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
  const run = async (w: CardWrite, done: string, undo: () => void) => {
    setBusy(true);
    try {
      await write.mutateAsync(w);
      setMessage(done);
      await client.invalidateQueries({ queryKey: studyKeys.all });
    } catch {
      undo();
      setMessage(cardsStrings.viewer.saveFailed);
    }
    setBusy(false);
  };
  const toggleFlag = () => {
    const before = flag;
    const next = flag ? 0 : REVIEW_FLAG;
    setFlag(next);
    void run(
      { kind: 'flag', card: ref, flag: next },
      next ? cardsStrings.viewer.markedForReview : cardsStrings.viewer.noMark,
      () => setFlag(before),
    );
  };
  const toggleHidden = () => {
    const before = hidden;
    setHidden(!hidden);
    void run(
      { kind: before ? 'unsuspend' : 'suspend', cards: [ref] },
      before ? cardsStrings.viewer.shownAgain : cardsStrings.viewer.hidden,
      () => setHidden(before),
    );
  };
  return { ref, flag, hidden, busy, message, setMessage, toggleFlag, toggleHidden };
}
