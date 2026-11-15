// The way from an assessment's page to its final review, waiting until something was seen.

import { Link } from 'react-router';
import { History } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import type { AssessmentView } from '@qv/study';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { decksStrings as s } from '../strings';

export function FinalReviewLink({
  node,
  view,
}: {
  node: CourseDeckNode;
  view: AssessmentView | null;
}) {
  const className = `${button.base} ${
    view?.reviewDays && view.facts.seen > 0
      ? 'border border-brand bg-brand-soft px-4 py-2.5 text-brand'
      : button.secondary
  } order-2 sm:order-4 sm:ml-auto`;
  const content = (
    <>
      <History className="size-4" aria-hidden="true" /> {s.panel.finalReview}
    </>
  );
  return view && view.facts.seen > 0 ? (
    <Link to={paths.deckReview(node.ref)} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" disabled className={className} title={s.panel.finalReviewWaits}>
      {content}
    </button>
  );
}
