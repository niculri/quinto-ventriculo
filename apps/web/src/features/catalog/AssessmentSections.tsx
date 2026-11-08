import { Layers, ListChecks } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type {
  AssessmentWithNotes,
  CourseWithAssessments,
  NoteSummary,
  QuizSummary,
  SemesterWithCourses,
} from '@qv/schema';
import type { Counts } from '@qv/srs';
import { paths } from '../../app/paths';
import type { CourseRef } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { button, card, page } from '../../ui/styles';
import { formatDate } from '../../lib/dates';
import { buildAnkiTree, courseDeck } from '../anki/tree';
import type { AnkiTree } from '../anki/tree';
import { useDeck } from '../decks/queries';
import { KIND_NAMES } from '../notes/header';
import { findPracticeDeck, practiceLink } from '../notes/Practice';
import { useDeckCounts } from '../study/DeckCounts';
import { Canonical } from './Redirects';
import { findCourse, noteBlocks, useCatalog } from './queries';

export const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

/** The course and assessment of the URL, with what a section's page needs around them. */
function useSection() {
  const { courseId = '', number = '', assessment = '' } = useParams();
  const catalog = useCatalog();
  const found = catalog.data ? findCourse(catalog.data, courseId) : null;
  return {
    catalog,
    found,
    number,
    assessment: found?.course.assessments.find((a) => a.id === `${courseId}/${assessment}`) ?? null,
  };
}

function SectionFrame({
  semester,
  course,
  assessment,
  title,
  children,
}: {
  semester: SemesterWithCourses;
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={page}>
      <Breadcrumbs
        items={[
          { label: 'Inicio', to: paths.home },
          { label: semester.name, to: paths.semester(semester.number) },
          { label: course.name, to: paths.course(course) },
          { label: assessment.name, to: paths.assessment(course, assessment.id) },
          { label: title },
        ]}
      />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">
        {course.name} · {assessment.name}
      </p>
      {children}
    </div>
  );
}

/** «Apuntes» of an assessment: its lectures and seminars, each with its deck and its test beside it. */
export function AssessmentNotesPage() {
  const { catalog, found, number, assessment } = useSection();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  if (!found || !assessment) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.assessmentNotes(course, assessment.id)} />;
  }
  const tree = buildAnkiTree(catalog.data);
  return (
    <SectionFrame semester={semester} course={course} assessment={assessment} title="Apuntes">
      <NoteLists course={course} assessment={assessment} tree={tree} />
    </SectionFrame>
  );
}

function NoteLists({
  course,
  assessment,
  tree,
}: {
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  tree: AnkiTree;
}) {
  // The course's deck counts every deck below it: one query for the whole page.
  const decks = courseDeck(tree, course.id);
  const deck = useDeck(decks?.id ?? '', decks !== null);
  const { counts } = useDeckCounts(deck.data);
  return (
    <>
      {assessment.notes.length === 0 ? (
        <p className="mt-6 text-muted">Todavía no hay apuntes de este certamen.</p>
      ) : null}
      {noteBlocks(assessment.notes).map((block) => (
        <div key={block.key} className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            {block.title}
          </h2>
          <ol className={`${card} divide-y divide-border overflow-hidden`}>
            {block.notes.map((n) => (
              <NoteRow
                key={n.id}
                course={course}
                assessment={assessment}
                note={n}
                tree={tree}
                counts={counts}
              />
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}

/** Who gave it and when: «Dra. Ana Prueba D. · 2026» (the number goes in the row's first column). */
function noteLine(note: NoteSummary): string {
  const h = note.header;
  return [
    h?.baseFor ? `Apunte base para la clase ${h.baseFor}` : null,
    h?.lecturer ?? null,
    h ? String(h.year) : null,
    note.subtitle ?? null,
    // The date only says something when the article changed after being published.
    note.version && note.version > 1 && note.versionAt
      ? `Actualizado el ${formatDate(note.versionAt)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A lecture: its number, its title (to the article) and, beside it, its deck and its test's topics. */
function NoteRow({
  course,
  assessment,
  note,
  tree,
  counts,
}: {
  course: CourseRef;
  assessment: AssessmentWithNotes;
  note: NoteSummary;
  tree: AnkiTree;
  counts: Map<string, Counts> | undefined;
}) {
  const practice = note.practice;
  const deck = practice?.deck ? findPracticeDeck(tree, assessment.id, practice.deck) : null;
  const own = deck ? counts?.get(deck.id) : undefined;
  const left = own ? own.new + own.learning + own.review : 0;
  const quiz = practice ? assessment.quizzes.find((q) => q.id === practice.quizId) : undefined;
  const chip =
    'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-ink';
  const number = note.header?.number ?? (note.header?.baseFor ? 'Base' : null);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2 sm:flex-nowrap sm:px-5">
      <Link
        to={paths.note(course, note.slug)}
        className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0"
      >
        <span className="w-9 flex-none text-center font-mono text-xs font-medium text-muted">
          {note.header?.number ? <span className="sr-only">{KIND_NAMES[note.kind]} </span> : null}
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{note.title}</span>
          <span className="mt-0.5 block text-sm text-muted">{noteLine(note)}</span>
        </span>
      </Link>
      {deck || quiz ? (
        <div className="ml-12 flex flex-none gap-1.5 sm:ml-0">
          {deck ? (
            <Link
              to={paths.deck(deck.ref)}
              className={chip}
              aria-label={`Anki de ${note.title}${left ? `: ${left} para hoy` : ''}`}
            >
              <Layers className="size-3.5" aria-hidden="true" /> Anki
              {left ? <span className="font-semibold text-brand">{left}</span> : null}
            </Link>
          ) : null}
          {quiz ? (
            <Link
              to={practiceLink(course, quiz, practice?.section, practice?.groups ?? [])}
              className={chip}
              aria-label={`Test de ${note.title}`}
            >
              <ListChecks className="size-3.5" aria-hidden="true" /> Test
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** «Tests» of an assessment: each one, with how many questions it has. */
export function AssessmentTestsPage() {
  const { catalog, found, number, assessment } = useSection();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  if (!found || !assessment) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.assessmentTests(course, assessment.id)} />;
  }
  return (
    <SectionFrame semester={semester} course={course} assessment={assessment} title="Tests">
      {assessment.quizzes.length ? (
        <ol className={`${card} mt-8 divide-y divide-border`}>
          {assessment.quizzes.map((q) => (
            <QuizRow key={q.id} course={course} quiz={q} />
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-muted">Todavía no hay tests de este certamen.</p>
      )}
    </SectionFrame>
  );
}

function QuizRow({ course, quiz }: { course: CourseRef; quiz: QuizSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <ListChecks className="size-5 flex-none text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-[70%] sm:basis-0">
        <Link to={paths.quiz(course, quiz)} className="font-medium text-ink hover:underline">
          {quiz.title}
        </Link>
        <p className="text-sm text-muted">
          {plural(quiz.questionCount, 'pregunta', 'preguntas')}
          {quiz.sectionCount > 1 ? ` · ${quiz.sectionCount} secciones` : ''}
        </p>
      </div>
      <Link to={paths.quiz(course, quiz)} className={`${button.base} ${button.secondary}`}>
        Practicar
      </Link>
    </li>
  );
}
