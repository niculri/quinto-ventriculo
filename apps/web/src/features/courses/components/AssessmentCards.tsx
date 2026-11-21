// An assessment on a course's page: its cards for notes, tests and Anki, and what is being studied of it.
import type { AssessmentWithNotes, Catalog, CourseWithAssessments } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { assessmentAnchor } from '../../../shared/lib/paths';
import { ListMark } from '../../catalog/components/AdminMarks';
import type { CourseDecks } from '../hooks/useCourseDecks';
import { assessmentDeck, notesLine } from '../model/material';
import { AnkiArt, NotesArt, TestsArt } from './SectionArt';
import { ART, SectionCard } from './SectionCard';
import { AnkiCard } from './AnkiCard';
import { ChooseUnits } from './ChooseUnits';
import { courseStrings as s } from '../course.strings';

export function AssessmentCards({
  catalog,
  course,
  assessment: a,
  decks,
}: {
  catalog: Catalog;
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  decks: CourseDecks;
}) {
  const { counts, mastery, failed, plan } = decks;
  const node = assessmentDeck(decks.tree, a);
  const questions = a.quizzes.reduce((t, q) => t + q.questionCount, 0);
  const onlyQuiz = a.quizzes.length === 1 ? a.quizzes[0]! : null;
  return (
    <section className="mt-10" aria-labelledby={assessmentAnchor(a.id)}>
      <h2 id={assessmentAnchor(a.id)} className="scroll-mt-24 text-xl font-semibold">
        {a.name}
        <ListMark thing={['assessment', a.id]} holder={['course', course.id]} />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {a.notes.length ? (
          <SectionCard
            to={paths.assessmentNotes(course, a.id)}
            title={s.section.notes}
            art={<NotesArt className={ART} />}
          >
            {notesLine(a)}
          </SectionCard>
        ) : null}
        {a.quizzes.length ? (
          <SectionCard
            to={onlyQuiz ? paths.quiz(course, onlyQuiz) : paths.assessmentTests(course, a.id)}
            title={s.section.tests}
            art={<TestsArt className={ART} />}
          >
            {onlyQuiz ? `${onlyQuiz.title} · ` : `${s.tests(a.quizzes.length)} · `}
            {s.questions(questions)}
          </SectionCard>
        ) : null}
        {node ? (
          <AnkiCard
            catalog={catalog}
            course={course}
            assessment={a}
            node={node}
            decks={decks}
            art={<AnkiArt className={ART} />}
          />
        ) : null}
      </div>
      {plan && node ? (
        <ChooseUnits node={node} counts={counts} mastery={mastery} plan={plan} />
      ) : null}
      {!plan && node && !failed ? <Skeleton className="mt-3 h-5 w-56" /> : null}
    </section>
  );
}
