// The Anki card of an assessment on a course's page: its decks and cards, the summary, mastery and today's load.
import type { ReactNode } from 'react';
import type { AssessmentWithNotes, Catalog, CourseWithAssessments } from '@qv/schema';
import { assessmentView } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { countDecks } from '../../catalog/model/catalog';
import { CountNumbers, DayLoad } from '../../progress/DeckCounts';
import { MasteryMeter } from '../../progress/MasteryMeter';
import type { CourseDecks } from '../hooks/useCourseDecks';
import { unitsOf } from '../model/material';
import { SectionCard } from './SectionCard';
import { courseStrings as s } from '../course.strings';

const emptyLoad = (node: CourseDeckNode, plan: StudyPlan) =>
  unitsOf(node, plan).on === 0 ? s.noneOn : s.doneToday;

export function AnkiCard({
  catalog,
  course,
  assessment: a,
  node,
  decks: { counts, mastery, failed, data, today, plan },
  art,
}: {
  catalog: Catalog;
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  node: CourseDeckNode;
  decks: CourseDecks;
  art: ReactNode;
}) {
  const own = counts?.get(node.id);
  const summary =
    data && today !== null
      ? assessmentView({
          decks: data.decks,
          plan: data.plan,
          progress: data.progress ?? [],
          assessmentId: node.id,
          today,
          prefs: data.prefs,
        }).summary
      : null;
  return (
    <SectionCard
      to={paths.deck(node.ref)}
      title={s.section.anki}
      art={art}
      footer={
        <>
          {/* Their lines are always there: a date or the numbers arriving move nothing. */}
          {failed ? null : (
            <span className="mb-1.5 block space-y-1">
              <span className="block h-4 truncate text-xs text-muted">{summary}</span>
              <span className="flex h-4 items-center">
                {mastery ? (
                  <MasteryMeter value={mastery.get(node.id) ?? 0} align="above" />
                ) : (
                  <Skeleton className="h-4 w-[5.5rem]" />
                )}
              </span>
            </span>
          )}
          <span className="flex h-5 items-center">
            {own ? (
              <span
                role="group"
                aria-label={s.todayIn(a.name)}
                className="flex items-center gap-2 text-xs text-muted"
              >
                {plan ? (
                  <DayLoad
                    counts={own}
                    medianAnswerMs={plan.medianAnswerMs}
                    empty={emptyLoad(node, plan)}
                  />
                ) : (
                  <>
                    <CountNumbers counts={own} />
                    {s.forToday}
                  </>
                )}
              </span>
            ) : failed ? (
              <span className="text-xs text-muted">{s.failed}</span>
            ) : (
              <Skeleton className="h-5 w-24" />
            )}
          </span>
        </>
      }
    >
      {s.decks(countDecks(catalog, course.id, a.id))}
      {' ·'} {s.cards(node.cardCount)}
    </SectionCard>
  );
}
