// What is left today in each deck of a tree, as Anki's deck list counts it, and its mastery, computed again when a
// card comes due.
import { useEffect, useMemo, useState } from 'react';
import type { DeckDetail } from '@qv/schema';
import { deckCounts, masteryByDeck, nextCountChange } from '@qv/study';
import { useStudyData } from '../queries';

export function useDeckCounts(deck: DeckDetail | undefined) {
  const study = useStudyData(deck);
  // Computed when something changed or a card came due, not every minute.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!study.data) return;
    const at = nextCountChange(study.data);
    if (at === null) return;
    const id = setTimeout(() => setTick((t) => t + 1), Math.min(at - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [study.data, tick]);
  const counts = useMemo(() => {
    void tick;
    return study.data ? deckCounts(study.data) : undefined;
  }, [study.data, tick]);
  const mastery = useMemo(() => {
    void tick;
    return study.data ? masteryByDeck(study.data) : undefined;
  }, [study.data, tick]);
  return { ...study, counts, mastery };
}
