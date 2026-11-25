// What is left today in each deck of a tree, as Anki's deck list counts it, its mastery and how many of its cards were
// seen, computed again when a card comes due.
import { useEffect, useState } from 'react';
import type { DeckDetail } from '@qv/schema';
import { deckCounts, masteryByDeck, nextCountChange, seenByDeck } from '@qv/study';
import { readClock } from '../../../shared/lib/clock';
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
  // The counts read the clock: it is read again with new data and with each tick.
  const now = readClock(study.data, tick);
  const counts = study.data ? deckCounts(study.data, now) : undefined;
  const mastery = study.data ? masteryByDeck(study.data, now) : undefined;
  const seen = study.data ? seenByDeck(study.data) : undefined;
  return { ...study, counts, mastery, seen };
}
