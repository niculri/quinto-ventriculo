// An assessment on a course's page: its cards for notes, tests and Anki, and what is being studied of it.
import type { AssessmentWithNotes, Catalog, CourseWithAssessments } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { assessmentAnchor } from '../../../shared/lib/paths';
import { ListMark } from '../../catalog/components/AdminMarks';
import type { CourseDecks } from '../hooks/useCourseDecks';
import { assessmentDeck, notesLine } from '../model/material';
import { AnkiArt, GymkanaArt, NotesArt, TestsArt } from './SectionArt';
import { gymkanaDeck } from '../../catalog/model/gymkana';
import { ART, SectionCard, TILT } from './SectionCard';
import { AnkiCard } from './AnkiCard';
import { ChooseUnits } from './ChooseUnits';
import { assessmentCardsStrings as s } from './strings/AssessmentCards.strings';

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
  const { counts, seen, failed, plan } = decks;
  const node = assessmentDeck(decks.tree, a);
  const gymkana = gymkanaDeck(decks.tree, a.id);
  const questions = a.quizzes.reduce((t, q) => t + q.questionCount, 0);
  const onlyQuiz = a.quizzes.length === 1 ? a.quizzes[0]! : null;
  return (
    <section className="mt-10" aria-labelledby={assessmentAnchor(a.id)}>
      <h2 id={assessmentAnchor(a.id)} className="scroll-mt-24 font-serif text-xl font-semibold">
        {a.name}
        <ListMark thing={['assessment', a.id]} holder={['course', course.id]} />
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {a.notes.length ? (
          <SectionCard
            to={paths.assessmentNotes(course, a.id)}
            title={s.section.notes}
            art={<NotesArt className={`${ART} ${TILT}`} />}
          >
            {notesLine(a)}
          </SectionCard>
        ) : null}
        {a.quizzes.length ? (
          <SectionCard
            to={onlyQuiz ? paths.quiz(course, onlyQuiz) : paths.assessmentTests(course, a.id)}
            title={s.section.tests}
            art={<TestsArt className={`${ART} ${TILT}`} />}
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
            art={<AnkiArt className={`${ART} ${TILT}`} />}
          />
        ) : null}
        {gymkana ? (
          <SectionCard
            to={paths.gymkana(course, a.id)}
            title={s.section.gymkana}
            art={<GymkanaArt className={ART} />}
          >
            {s.stations(gymkana.cardCount)}
          </SectionCard>
        ) : null}
      </div>
      {plan && node ? <ChooseUnits node={node} counts={counts} seen={seen} plan={plan} /> : null}
      {!plan && node && !failed ? <Skeleton className="mt-3 h-5 w-56" /> : null}
    </section>
  );
}
