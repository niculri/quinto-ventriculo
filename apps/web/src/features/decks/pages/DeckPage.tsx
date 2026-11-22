// A deck's page below a course (an assessment, a week, a deck): its options, «Estudiar» with the load, its
// subdecks and the way to the final review.

import { Navigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { DraftOnlyNotice } from '../../../shared/ui/DraftOnlyNotice';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { page } from '../../../shared/ui/styles';
import { PageCrumbs } from '../../catalog/components/AdminMarks';
import { useDraftOnly } from '../../catalog/hooks/useDraftOnly';
import { deckCrumbs } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { AssessmentOptions } from '../components/AssessmentOptions';
import { DeckHeader } from '../components/DeckHeader';
import { DeckStudyPanel } from '../components/DeckStudyPanel';
import { useDeckPage } from '../hooks/useDeckPage';

export function DeckPage({ node }: { node: CourseDeckNode }) {
  const { deck, plan, study, view, goTo } = useDeckPage(node);
  const draftOnly = useDraftOnly(['deck', node.id]);
  if (goTo) return <Navigate replace to={paths.deck(goTo)} />;

  return (
    <div className={page}>
      <PageCrumbs thing={['deck', node.id]} items={deckCrumbs(node)} />
      <DeckHeader node={node} />

      {draftOnly ? (
        <div className="mt-6">
          <DraftOnlyNotice kind="deck" />
        </div>
      ) : null}

      {!draftOnly && node.depth === 3 ? (
        <AssessmentOptions node={node} plan={plan.data} view={view} />
      ) : null}

      {draftOnly ? null : deck.isError ? (
        <div className="mt-6">
          <ErrorWithRetry error={deck.error} onRetry={() => void deck.refetch()} />
        </div>
      ) : (
        <DeckStudyPanel node={node} study={study} view={view} />
      )}
    </div>
  );
}
