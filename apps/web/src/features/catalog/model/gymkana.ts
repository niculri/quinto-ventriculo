// An assessment's gymkana: its deck named «Gymkana» right under the assessment's.
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
