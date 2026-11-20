// A card of a student's study state: a review card, three days from being due, with what a test changes in the patch.
import type { StoredCard } from '../../features/progress/api/repository';

export function storedCard(
  noteGuid: string,
  ord: number,
  deckId: string,
  patch: Partial<StoredCard> = {},
) {
  return {
    noteGuid,
    ord,
    deckId,
    phase: 'review',
    interday: true,
    remainingSteps: 0,
    due: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    interval: 3,
    stability: 5,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    lastReview: new Date().toISOString(),
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: new Date().toISOString(),
    ...patch,
  } satisfies StoredCard;
}
