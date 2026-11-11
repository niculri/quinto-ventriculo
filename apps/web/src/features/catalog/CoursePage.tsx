import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ChevronRight, Layers, Search } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { assessmentAnchor, paths } from '../../app/paths';
import { Canonical } from './Redirects';
import type { Counts } from '@qv/srs';
import type {
  AssessmentWithNotes,
  Catalog,
  CourseWithAssessments,
  SemesterWithCourses,
} from '@qv/schema';
import { ErrorWithRetry } from '../../ui/Notice';
import { Loading, Skeleton } from '../../ui/Loading';
import { button, card, linkCard, page } from '../../ui/styles';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { plural } from './AssessmentSections';
import { countDecks, countNotes, findCourse, useCatalog } from './queries';
import { AnkiArt, NotesArt, TestsArt } from './SectionArt';
import { useDeck } from '../decks/queries';
import { buildAnkiTree, courseDeck, descendants, hasPage } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { CountNumbers, DayLoad, useDeckCounts } from '../study/DeckCounts';
import { MasteryMeter } from '../study/MasteryMeter';
import { SimpleDeckTree } from '../anki/SimpleDeckTree';
import { assessmentView } from '../study/pace';
import { usePreferences, useStudyPlan, useToday } from '../study/queries';
import { UNIT_DEPTH, activeUnits } from '../study/simple';
import type { StudyPlan } from '../study/simple';
import { Heatmap } from '../stats/HeatmapCard';

export function CoursePage() {
  const { courseId = '', number = '' } = useParams();
  const catalog = useCatalog();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  const found = findCourse(catalog.data, courseId);
  if (!found) return <NotFoundPage />;
  const { semester, course } = found;
  // The course is in another semester than the URL says: to its canonical URL.
  if (String(semester.number) !== number) return <Canonical path={paths.course(course)} />;
  return <CourseView catalog={catalog.data} semester={semester} course={course} />;
}

/**
 * A course's page, the template of every course: a dashboard. Each assessment shows one card per section
 * (notes, tests, Anki), with what it has and a drawing behind; the lists are on each section's page.
 */
function CourseView({
  catalog,
  semester,
  course,
}: {
  catalog: Catalog;
  semester: SemesterWithCourses;
  course: CourseWithAssessments;
}) {
  const tree = buildAnkiTree(catalog);
  const decks = courseDeck(tree, course.id);
  // The course's deck counts every deck below it: one query for the whole page.
  const deck = useDeck(decks?.id ?? '', decks !== null);
  const { counts, mastery, error, data } = useDeckCounts(deck.data);
  const failed = deck.isError || !!error;
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const studyPlan = useStudyPlan();
  const plan = prefs ? (studyPlan.data ?? null) : null;

  const deckOf = (a: AssessmentWithNotes) =>
    tree.nodes.find(
      (n): n is CourseDeckNode => n.depth === 3 && hasPage(n) && n.assessmentId === a.id,
    ) ?? null;
  const assessments = course.assessments.filter(
    (a) => a.notes.length || a.quizzes.length || deckOf(a),
  );
  const notes = countNotes(course);
  const quizzes = course.assessments.reduce((t, a) => t + a.quizzes.length, 0);
  const deckCount = countDecks(catalog, course.id);
  const material = [
    notes ? plural(notes, 'apunte', 'apuntes') : '',
    quizzes ? plural(quizzes, 'test', 'tests') : '',
    deckCount ? plural(deckCount, 'mazo', 'mazos') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={page}>
      <Breadcrumbs
        items={[
          { label: 'Inicio', to: paths.home },
          { label: semester.name, to: paths.semester(semester.number) },
          { label: course.name },
        ]}
      />
      <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold tracking-tight">
        <span aria-hidden="true">{course.emoji}</span> {course.name}
      </h1>
      {material ? <p className="mt-2 text-muted">{material}</p> : null}

      {decks ? (
        // Only this course's decks, with a scale of its own.
        <Heatmap
          scope={`course:${course.id}`}
          deckIds={catalog.anki.decks.filter((d) => d.courseId === course.id).map((d) => d.id)}
          catalog={catalog}
          groupBy="assessment"
          courseId={course.id}
          className="mt-8"
        />
      ) : null}

      {assessments.length === 0 ? (
        <div className="mt-6 text-muted">
          <p>Todavía no hay material de este ramo.</p>
          <Link to={paths.courses} className={`${button.base} ${button.secondary} mt-4`}>
            Ver toda la carrera
          </Link>
        </div>
      ) : (
        assessments.map((a) => {
          const node = deckOf(a);
          const own = node ? counts?.get(node.id) : undefined;
          const lectures = a.notes.filter((n) => n.kind === 'lecture').length;
          const seminars = a.notes.filter((n) => n.kind === 'seminar').length;
          const others = a.notes.length - lectures - seminars;
          const questions = a.quizzes.reduce((t, q) => t + q.questionCount, 0);
          const onlyQuiz = a.quizzes.length === 1 ? a.quizzes[0]! : null;
          const summary =
            node && data && today !== null
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
            <section key={a.id} className="mt-10" aria-labelledby={assessmentAnchor(a.id)}>
              <h2 id={assessmentAnchor(a.id)} className="scroll-mt-24 text-xl font-semibold">
                {a.name}
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {a.notes.length ? (
                  <SectionCard
                    to={paths.assessmentNotes(course, a.id)}
                    title="Apuntes"
                    art={<NotesArt className={ART} />}
                  >
                    {[
                      lectures ? plural(lectures, 'clase', 'clases') : '',
                      seminars ? plural(seminars, 'seminario', 'seminarios') : '',
                      others ? plural(others, 'otro', 'otros') : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </SectionCard>
                ) : null}
                {a.quizzes.length ? (
                  <SectionCard
                    // One test: straight to it (its cover, with the topics), as in the menu.
                    to={
                      onlyQuiz ? paths.quiz(course, onlyQuiz) : paths.assessmentTests(course, a.id)
                    }
                    title="Tests"
                    art={<TestsArt className={ART} />}
                  >
                    {onlyQuiz
                      ? `${onlyQuiz.title} · `
                      : `${plural(a.quizzes.length, 'test', 'tests')} · `}
                    {plural(questions, 'pregunta', 'preguntas')}
                  </SectionCard>
                ) : null}
                {node ? (
                  <SectionCard
                    to={paths.deck(node.ref)}
                    title="Anki"
                    art={<AnkiArt className={ART} />}
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
                              aria-label={`Hoy en ${a.name}`}
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
                                  <CountNumbers counts={own} /> para hoy
                                </>
                              )}
                            </span>
                          ) : failed ? (
                            <span className="text-xs text-muted">No se pudo cargar.</span>
                          ) : (
                            <Skeleton className="h-5 w-24" />
                          )}
                        </span>
                      </>
                    }
                  >
                    {plural(countDecks(catalog, course.id, a.id), 'mazo', 'mazos')} ·{' '}
                    {plural(node.cardCount, 'tarjeta', 'tarjetas')}
                  </SectionCard>
                ) : null}
              </div>
              {plan && node ? (
                <ChooseUnits node={node} counts={counts} mastery={mastery} plan={plan} />
              ) : null}
              {/* Its line, so that the page does not jump when it arrives. */}
              {!plan && node && !failed ? <Skeleton className="mt-3 h-5 w-56" /> : null}
            </section>
          );
        })
      )}

      {decks ? (
        <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link
            to={paths.deck(decks.ref)}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <Layers className="size-4" aria-hidden="true" /> Todos los mazos del ramo
          </Link>
          <Link
            to={paths.cards(decks.ref)}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <Search className="size-4" aria-hidden="true" /> Ver las tarjetas
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** The weeks or lectures of an assessment and how many are turned on. */
function unitsOf(node: CourseDeckNode, plan: StudyPlan) {
  return { total: node.children.length, on: activeUnits(descendants(node), plan).size };
}

function emptyLoad(node: CourseDeckNode, plan: StudyPlan) {
  return unitsOf(node, plan).on === 0 ? 'Sin activar' : 'Listo por hoy';
}

/**
 * «Qué estás estudiando»: the switch of each week or lecture of an assessment, folded. It starts open while
 * nothing is turned on, which is the first thing a new student has to do.
 */
function ChooseUnits({
  node,
  counts,
  mastery,
  plan,
}: {
  node: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  mastery: Map<string, number> | undefined;
  plan: StudyPlan;
}) {
  const { total, on } = unitsOf(node, plan);
  // Decided once: turning the first one on does not fold the list away from under the finger.
  const [open, setOpen] = useState(on === 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted hover:text-ink"
      >
        <ChevronRight
          className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        Qué estás estudiando · {on} de {total} {on === 1 ? 'activada' : 'activadas'}
      </button>
      {open ? (
        <div className={`${card} mt-2 p-3 sm:px-5`}>
          <SimpleDeckTree
            root={node}
            counts={counts}
            plan={plan}
            mastery={mastery}
            label={`Semanas y clases de ${node.label}`}
            upTo={UNIT_DEPTH}
          />
        </div>
      ) : null}
    </div>
  );
}

const ART =
  'pointer-events-none absolute -right-2 -bottom-3 size-28 text-brand opacity-30 transition-opacity group-hover:opacity-50';

/** A section of an assessment: its name, what it has, and a drawing behind. The whole card is the link. */
function SectionCard({
  to,
  title,
  art,
  footer,
  children,
}: {
  to: string;
  title: string;
  art: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`${linkCard} group relative flex min-h-36 flex-col sm:min-h-44 overflow-hidden p-5`}
    >
      {art}
      <div className="relative flex items-start justify-between gap-2">
        <h3 className="font-serif text-2xl font-semibold tracking-tight">{title}</h3>
        <ArrowRight
          className="mt-2 size-4 flex-none text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </div>
      <p className="relative mt-1.5 text-sm text-muted">{children}</p>
      {footer ? <div className="relative mt-auto pt-4">{footer}</div> : null}
    </Link>
  );
}
