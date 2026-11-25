// The panel «Estudiar» of a deck's page: the button, the load of today (the only place that says the new cards, which
// the whole assessment shares), dominio, the final review and what is below.

import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { preloadOnIntent } from '../../../shared/lib/preload';
import { Skeleton } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { button, card } from '../../../shared/ui/styles';
import type { AssessmentView } from '@qv/study';
import { DayLoad } from '../../progress/components/DeckCounts';
import type { useDeckCounts } from '../../progress/hooks/useDeckCounts';
import { MasteryMeter } from '../../progress/components/MasteryMeter';
import { usePreferences, useStudyPlan } from '../../progress/queries';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { FinalReviewLink } from './FinalReviewLink';
import { SimpleDetails } from './SimpleDetails';
import { deckStudyPanelStrings as s } from './strings/DeckStudyPanel.strings';

/** While the preferences load it is already the simple view, so a student never sees Anki's table flash by. */
export function DeckStudyPanel({
  node,
  study,
  view,
}: {
  node: CourseDeckNode;
  study: ReturnType<typeof useDeckCounts>;
  view: AssessmentView | null;
}) {
  const { counts, mastery, seen, error, retry } = study;
  const { prefs } = usePreferences();
  const plan = useStudyPlan();
  const own = counts?.get(node.id);
  return (
    <section aria-label={s.panel.study} className={`${card} mt-6 p-4 sm:p-6`}>
      {error ? (
        <ErrorWithRetry error={error} onRetry={retry} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to={paths.deckStudy(node.ref)}
              {...preloadOnIntent('anki-study')}
              className={`${button.base} ${button.primary} order-1 flex-1 py-3 text-base sm:flex-none sm:px-10`}
            >
              <Play className="size-4" aria-hidden="true" /> {s.panel.study}
            </Link>
            <div
              aria-label={s.panel.today}
              role="group"
              className="order-3 flex items-center gap-2 font-medium max-sm:basis-full sm:order-2 sm:min-w-64"
            >
              {!own ? (
                <Skeleton className="h-6 w-36" />
              ) : (
                <DayLoad
                  counts={own}
                  medianAnswerMs={plan.data?.medianAnswerMs ?? null}
                  detail
                  split
                  side="right"
                />
              )}
            </div>
            <div className="order-4 flex h-5 items-center max-sm:basis-full sm:order-3">
              {mastery ? (
                <MasteryMeter value={mastery.get(node.id) ?? null} align="left" />
              ) : (
                <Skeleton className="h-4 w-[5.5rem]" />
              )}
            </div>
            {node.depth === 3 ? <FinalReviewLink node={node} view={view} /> : null}
          </div>
          <SimpleDetails
            node={node}
            counts={counts}
            seen={seen}
            plan={prefs ? plan.data : undefined}
            catchUp={view?.catchUp ?? null}
          />
        </>
      )}
    </section>
  );
}
