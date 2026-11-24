// An assessment's gymkana: its deck named «Gymkana» right under the assessment's, and the test id its writing rounds
// are kept under, which whatever counts tests (the heatmap, the statistics) needs too.
import { GYMKANA_DECK_LABEL } from '@qv/schema';
import { hasPage } from './tree';
import type { AnkiTree, CourseDeckNode } from './tree';

export function gymkanaDeck(tree: AnkiTree, assessmentId: string): CourseDeckNode | null {
  return (
    tree.nodes.find(
      (n): n is CourseDeckNode =>
        n.depth === 4 &&
        n.label === GYMKANA_DECK_LABEL &&
        n.assessmentId === assessmentId &&
        n.cardCount > 0 &&
        hasPage(n),
    ) ?? null
  );
}

/** A test id (`^[a-z0-9]+(-[a-z0-9]+)*$`) that no imported test has: theirs come from their slugs. */
export const caQuizId = (deckId: string) => `gymkana-${deckId}`;
