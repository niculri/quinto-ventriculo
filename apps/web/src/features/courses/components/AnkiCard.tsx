// The Anki card of an assessment on a course's page: its decks and cards, the summary, mastery and today's load.
import type { ReactNode } from 'react';
import type { AssessmentWithNotes, Catalog, CourseWithAssessments } from '@qv/schema';
import { assessmentView } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { countDecks } from '../../catalog/model/catalog';
import { DayLoad } from '../../progress/components/DeckCounts';
import { MasteryMeter } from '../../progress/components/MasteryMeter';
import type { CourseDecks } from '../hooks/useCourseDecks';
import { unitsOf } from '../model/material';
import { SectionCard } from './SectionCard';
import { ankiCardStrings as s } from './strings/AnkiCard.strings';

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
          // v8 ignore next: useStudyData always fills progress; the type leaves it optional for other callers.
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
          {/* Their lines are always there: a date or the numbers arriving move nothing. Their text covers the drawing
              behind (a long load can reach it), so a stroke never crosses a letter. */}
          {failed ? null : (
            <span className="mb-1.5 block space-y-1">
              <span className="block h-4 truncate text-xs text-muted">
                {summary ? <span className="bg-surface pr-1.5">{summary}</span> : null}
              </span>
              <span className="flex h-4 items-center">
                {mastery ? (
                  <MasteryMeter value={mastery.get(node.id) ?? null} align="above" />
                ) : (
                  <Skeleton className="h-4 w-[5.5rem]" />
                )}
              </span>
            </span>
          )}
          <span className="flex h-5 items-center">
            {own && plan ? (
              <span
                role="group"
                aria-label={s.todayIn(a.name)}
                className="flex items-center gap-2 bg-surface pr-1.5 text-xs text-muted"
              >
                <DayLoad
                  counts={own}
                  medianAnswerMs={plan.medianAnswerMs}
                  empty={emptyLoad(node, plan)}
                />
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
