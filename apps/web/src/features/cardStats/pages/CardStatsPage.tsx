// A deck's statistics page (a course, an assessment, a week or a deck): the student's own cards by state, answers,
// time and retention, the activity of the last and next 30 days and the cards forgotten most often.

import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { page } from '../../../shared/ui/styles';
import { useTitle } from '../../../shared/hooks/useTitle';
import { StatsUnavailableError } from '../../progress/api/repository';
import { deckCrumbs } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { StatsBody } from '../components/StatsBody';
import { useCardStats } from '../hooks/useCardStats';
import { cardStatsPageStrings as s } from './strings/CardStatsPage.strings';

export function CardStatsPage({ node }: { node: CourseDeckNode }) {
  const title = node.depth === 2 && node.course ? node.course.name : node.label;
  useTitle(s.pageTitle(title));
  const { query, advanced, hard } = useCardStats(node);
  return (
    <div className={page}>
      <Breadcrumbs items={deckCrumbs(node, { label: s.crumb })} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.heading}</h1>
      <p className="mt-2 text-muted">{s.scope(title)}</p>
      {query.isError && !query.data ? (
        <ErrorWithRetry
          error={query.error}
          message={query.error instanceof StatsUnavailableError ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      ) : advanced === null ? null : (
        <StatsBody node={node} data={query.data ?? null} advanced={advanced} hard={hard} />
      )}
    </div>
  );
}
