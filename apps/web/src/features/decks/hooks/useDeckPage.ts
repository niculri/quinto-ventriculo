// What a deck's page reads: the deck, the plan, its counts and its assessment's view; and where a week or a lecture
// goes instead (its assessment's page: there is nothing more inside it).

import { useDeckCounts } from '../../progress/hooks/useDeckCounts';
import { useAssessmentView, useStudyPlan } from '../../progress/queries';
import { ancestry } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useCountOpen } from '../../usage/count';
import { useTitle } from '../../../shared/hooks/useTitle';
import { useDeck } from './useDeck';

export function useDeckPage(node: CourseDeckNode) {
  const deck = useDeck(node.id);
  const plan = useStudyPlan();
  // Computing it takes a while with many cards: once here, for the options and the panel.
  const study = useDeckCounts(deck.data);
  const view = useAssessmentView(node.depth === 3 ? node.id : null);

  useTitle(node.label);

  const assessment = node.depth > 3 ? ancestry(node).find((n) => n.depth === 3) : null;
  useCountOpen('deck', deck.data && !assessment?.ref ? node.id : null);
  return { deck, plan, study, view, goTo: assessment?.ref ?? null };
}
