// Not Anki's: with the preset option `fillNewWithSiblings`, the new cards that a sibling buried come out at the end,
// one card of each note per round, while the day's limits have room and nothing else is left to gather.
import type { QueueCard, QueueDeck } from './base';
import type { LimitTree } from './limits';

/** Whether a new card buried by a sibling waits for the rounds: its deck fills the day with siblings. */
export function waitsAsSibling(
  deckList: boolean | undefined,
  byId: ReadonlyMap<string, QueueDeck>,
  deckId: string,
): boolean | undefined {
  return !deckList && byId.get(deckId)?.config.fillNewWithSiblings;
}

/** Round after round, one card of each note: siblings end up as far apart as they can. */
export function takeSiblingsInRounds(
  limits: LimitTree,
  buried: QueueCard[],
  takeNew: (c: QueueCard) => void,
): void {
  let siblings = buried;
  while (siblings.length && !limits.rootReached('new')) {
    const inRound = new Set<string>();
    const later: QueueCard[] = [];
    for (const c of siblings) {
      if (limits.rootReached('new')) break;
      if (limits.reached(c.deckId, 'new')) continue;
      if (inRound.has(c.noteGuid)) {
        later.push(c);
      } else {
        inRound.add(c.noteGuid);
        takeNew(c);
      }
    }
    siblings = later;
  }
}
