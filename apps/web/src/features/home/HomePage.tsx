import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, Check, ListChecks, Play, X } from 'lucide-react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Catalog, CourseWithAssessments } from '@qv/schema';
import type { Counts } from '@qv/srs';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { Skeleton } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { button, card, linkCard, page } from '../../ui/styles';
import { buildAnkiTree, courseDeck, descendants } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { countDecks, countNotes, locateNote, materialLabel, useCatalog } from '../catalog/queries';
import { useDeck } from '../decks/queries';
import { useUser } from '../session/context';
import { Heatmap } from '../stats/HeatmapCard';
import { DayLoad, useDeckCounts } from '../study/DeckCounts';
import { MasteryMeter } from '../study/MasteryMeter';
import { nearestExamText } from '../study/pace';
import { usePreferences, useSavePreferences, useStudyPlan, useToday } from '../study/queries';
import type { StudyPreferences } from '../study/repository';
import { activeUnits, totalCards } from '../study/simple';
import type { StudyPlan } from '../study/simple';
import { homeCourseCounts } from './counts';
import type { HomeStudyBase } from './counts';
import { lastNote } from './lastNote';
import { addCourse, listText, myCourses, removeCourse } from './myCourses';
import type { MyCourses as MyCourseLists } from './myCourses';
import { todayCourses, useCountsTick, useHomeStudy } from './queries';

/**
 * Inicio (plan step 3.2): only what is the student's. From the top: the first steps (until they are done), «Hoy» (one
 * row per course with something on or studied), «Seguir» (a test half done and the last note opened), the days of
 * study, «Tus ramos» (features/home/myCourses.ts) and a line to the whole degree. «Hoy» counts without downloading any
 * deck (features/home/counts.ts).
 *
 * Nothing moves while it loads: the sections appear together, when what decides them has arrived, in a space as tall as
 * the page was the last time on this device; inside them, what comes later (the numbers, the heatmap) has its room.
 */

/** The page's height the last time, on this device. */
const HEIGHT_KEY = 'qv-home-height';
const DEFAULT_HEIGHT = 1100;
export const FIRST_STEPS = 'first-steps';

function savedHeight(): number {
  try {
    const n = Number(window.localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(n) && n > 200 && n < 10_000 ? n : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

export function HomePage() {
  const user = useUser();
  const catalog = useCatalog();
  const firstName = user.name?.split(' ')[0];

  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio' }]} />
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {firstName ? `Hola, ${firstName}` : 'Hola'}
        </h1>
        <p className="mt-1.5 text-muted">¿Qué toca estudiar hoy?</p>
      </div>
      {catalog.isError ? (
        <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : (
        <HomeBody catalog={catalog.data} />
      )}
    </div>
  );
}

/** The open rounds of the tests (`quiz_rounds`), read again on each visit: «Seguir» must not change after it shows. */
function useOpenRounds() {
  const { quiz } = useServices();
  return useQuery({
    queryKey: ['quiz-open-rounds'],
    queryFn: () => quiz.openRounds(),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

function HomeBody({ catalog }: { catalog: Catalog | undefined }) {
  const { prefs } = usePreferences();
  const plan = useStudyPlan();
  const rounds = useOpenRounds();
  const reserved = useMemo(() => savedHeight(), []);
  const box = useRef<HTMLDivElement>(null);
  // Once shown, it stays: a later read (the window gets the focus again) changes what is inside, never the whole page.
  const [shown, setShown] = useState(false);
  const ready =
    !!catalog &&
    !!prefs &&
    !!plan.data &&
    (shown || (rounds.isFetchedAfterMount && !rounds.isFetching));
  if (ready && !shown) setShown(true);
  useLayoutEffect(() => {
    if (!ready || !box.current) return;
    try {
      window.localStorage.setItem(HEIGHT_KEY, String(Math.round(box.current.offsetHeight)));
    } catch {
      // blocked storage: the default height next time
    }
  });
  if (plan.isError)
    return <ErrorWithRetry error={plan.error} onRetry={() => void plan.refetch()} />;
  if (!ready) {
    return (
      // flow-root: the sections' margins stay inside, so this box does not move when they replace the skeleton.
      <div style={{ minHeight: reserved }} className="flow-root" aria-busy="true">
        <Skeleton className="mt-6 h-40 sm:mt-8" />
        <Skeleton className="mt-6 h-56 sm:mt-8" />
      </div>
    );
  }
  return (
    <div ref={box} className="flow-root">
      <Sections catalog={catalog} prefs={prefs} plan={plan.data} rounds={rounds.data ?? []} />
    </div>
  );
}

function Sections({
  catalog,
  prefs: saved,
  plan,
  rounds,
}: {
  catalog: Catalog;
  prefs: StudyPreferences;
  plan: StudyPlan;
  rounds: Awaited<ReturnType<ReturnType<typeof useServices>['quiz']['openRounds']>>;
}) {
  // What the student chooses here (the semester, the courses added or taken out, «Ocultar») shows at once, while it is
  // saved: the page does not wait for the database to change (review of 3.2: nothing moves after a moment).
  const save = useSavePreferences();
  const shown = save.isPending && save.variables ? save.variables : saved;
  const tree = useMemo(() => buildAnkiTree(catalog), [catalog]);
  const today = useMemo(() => todayCourses(catalog, plan), [catalog, plan]);
  const mine = useMemo(
    () =>
      myCourses(catalog, shown, new Set(today.flatMap((n) => (n.courseId ? [n.courseId] : [])))),
    [catalog, shown, today],
  );
  const anyOn = useMemo(() => activeUnits(tree.nodes, plan).size > 0, [tree, plan]);
  // Where to choose what to study: the first course of «Tus ramos» with decks.
  const withDecks = mine.cards.filter((c) => courseDeck(tree, c.id));
  const choose = withDecks.length >= 1 ? paths.course(withDecks[0]!) : '#tus-ramos';
  const steps = {
    // «Elige tus ramos»: the semester, a course added, or a course with something on (it comes by itself).
    course: shown.semester !== null || shown.addedCourses.length > 0 || today.length > 0,
    unit: anyOn,
    card: plan.answeredDecks.length > 0,
  };
  const showSteps =
    !(steps.course && steps.unit && steps.card) && !shown.dismissed.includes(FIRST_STEPS);
  return (
    <>
      {showSteps ? (
        <FirstSteps
          steps={steps}
          onHide={() => save.mutate({ ...shown, dismissed: [...shown.dismissed, FIRST_STEPS] })}
          choose={choose}
          study={today[0] ? paths.deckStudy(today[0].ref) : null}
        />
      ) : null}
      <Today catalog={catalog} courses={today} choose={choose} />
      <Follow catalog={catalog} rounds={rounds} />
      {/* Every deck of the student, also those no longer on the site. */}
      {catalog.anki.decks.length ? (
        <Heatmap
          scope="all"
          deckIds={null}
          catalog={catalog}
          groupBy="course"
          className="mt-6 sm:mt-8"
        />
      ) : null}
      <MyCourses catalog={catalog} prefs={shown} courses={mine} onChange={(p) => save.mutate(p)} />
      <p className="mt-6 sm:mt-8">
        <Link
          to={paths.courses}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          Ver toda la carrera <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </p>
    </>
  );
}

// The first steps ---------------------------------------------------------------------------------------------------

function FirstSteps({
  steps,
  onHide,
  choose,
  study,
}: {
  steps: { course: boolean; unit: boolean; card: boolean };
  onHide: () => void;
  choose: string;
  study: string | null;
}) {
  // The step that comes is the only one with its text and its button: the list stays short on the phone.
  const next = !steps.course ? 1 : !steps.unit ? 2 : 3;
  const item = (done: boolean, n: number, title: string, text: string, action: ReactNode) => (
    <li className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={`flex size-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-brand text-white dark:text-[#0a1316]' : 'bg-brand-soft text-brand'}`}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-sm:basis-full sm:flex-1">
          <p className={`font-medium ${done ? 'text-muted line-through' : ''}`}>
            {title}
            <span className="sr-only">{done ? ' (hecho)' : ' (pendiente)'}</span>
          </p>
          {n === next ? <p className="mt-0.5 text-sm text-muted">{text}</p> : null}
        </div>
        {n === next && action ? <div className="flex-none">{action}</div> : null}
      </div>
    </li>
  );
  const link = (to: string, label: string) =>
    to.startsWith('#') ? (
      <a href={to} className={`${button.base} ${button.secondary} py-2`}>
        {label}
      </a>
    ) : (
      <Link to={to} className={`${button.base} ${button.secondary} py-2`}>
        {label}
      </Link>
    );
  return (
    <section className={`${card} mt-6 p-4 sm:mt-8 sm:p-6`} aria-labelledby="first-steps">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="first-steps" className="font-serif text-xl font-semibold">
          Primeros pasos
        </h2>
        <button
          type="button"
          className={`${button.base} ${button.ghost} -my-2 -mr-2`}
          onClick={onHide}
        >
          Ocultar
        </button>
      </div>
      <ol className="mt-1 divide-y divide-border">
        {item(
          steps.course,
          1,
          'Elige tus ramos',
          'Di en qué semestre estás o agrega un ramo, y aparecen más abajo.',
          next === 1 ? link('#tus-ramos', 'Elegir ramos') : null,
        )}
        {item(
          steps.unit,
          2,
          'Activa la semana o clase que estás viendo',
          'Así empiezan a salir sus tarjetas nuevas.',
          next === 2 ? link(choose, 'Ir a tu ramo') : null,
        )}
        {item(
          steps.card,
          3,
          'Responde tu primera tarjeta',
          'Muestra la respuesta y di si te la sabías.',
          next === 3 && study ? (
            <Link to={study} className={`${button.base} ${button.primary} py-2`}>
              <Play className="size-4" aria-hidden="true" /> Estudiar
            </Link>
          ) : null,
        )}
      </ol>
    </section>
  );
}

// «Hoy» -------------------------------------------------------------------------------------------------------------

function Today({
  catalog,
  courses,
  choose,
}: {
  catalog: Catalog;
  courses: CourseDeckNode[];
  choose: string;
}) {
  const study = useHomeStudy(catalog, courses);
  const tick = useCountsTick(study.home?.decks ?? null, study.base?.prefs.learnAheadMinutes);
  const results = useMemo(() => {
    void tick;
    const { base, home } = study;
    if (!base || !home) return null;
    return new Map(
      courses.map((n) => [
        n.id,
        home.truncated ? null : homeCourseCounts(base, n.id, catalog.anki.decks, home.decks),
      ]),
    );
  }, [study, courses, catalog, tick]);
  return (
    <section className={`${card} mt-6 p-4 sm:mt-8 sm:p-6`} aria-labelledby="today">
      <h2 id="today" className="font-serif text-xl font-semibold">
        Hoy
      </h2>
      {courses.length === 0 ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="text-sm text-muted">
            Todavía no activas ninguna semana o clase. Cuando lo hagas, aquí verás lo que te toca
            cada día.
          </p>
          {choose.startsWith('#') ? (
            <a href={choose} className={`${button.base} ${button.primary}`}>
              Elegir qué estudiar
            </a>
          ) : (
            <Link to={choose} className={`${button.base} ${button.primary}`}>
              Elegir qué estudiar
            </Link>
          )}
        </div>
      ) : study.error ? (
        <div className="mt-3">
          <ErrorWithRetry error={study.error} onRetry={study.retry} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {courses.map((n) => {
            const r = results?.get(n.id);
            return r === undefined || !study.base ? (
              <TodayRow key={n.id} node={n} base={null} counts={null} mastery={null} />
            ) : r?.counts ? (
              <TodayRow
                key={n.id}
                node={n}
                base={study.base}
                counts={r.counts}
                mastery={r.mastery}
              />
            ) : (
              <DeckTodayRow key={n.id} node={n} base={study.base} />
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The few times the home page cannot know the new cards without the deck (features/home/counts.ts): the row reads its
 * deck, as the course's page does.
 */
function DeckTodayRow({ node, base }: { node: CourseDeckNode; base: HomeStudyBase }) {
  const deck = useDeck(node.id);
  const { counts, mastery, error } = useDeckCounts(deck.data);
  return (
    <TodayRow
      node={node}
      base={base}
      counts={counts?.get(node.id) ?? null}
      mastery={mastery?.get(node.id) ?? null}
      failed={!!deck.error || !!error}
    />
  );
}

function TodayRow({
  node,
  base,
  counts,
  mastery,
  failed = false,
}: {
  node: CourseDeckNode;
  base: HomeStudyBase | null;
  counts: Counts | null;
  mastery: number | null;
  failed?: boolean;
}) {
  const course = node.course;
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const left = counts ? totalCards(counts) : 0;
  const nothingActive = !!base && activeUnits(descendants(node), base.plan).size === 0;
  const exam =
    base && today !== null
      ? nearestExamText(
          base.decks,
          base.plan,
          base.progress ?? [],
          node.children.map((c) => c.id),
          today,
          base.prefs,
        )
      : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      {/* On the phone, the load in minutes does not leave room beside the name: it goes below, with the button. */}
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <Link
          to={paths.course(node.ref.course)}
          className="block truncate font-medium hover:underline"
        >
          <span aria-hidden="true">{course?.emoji}</span> {course?.name ?? node.label}
        </Link>
        {/* Its line is always there: a date or the numbers arriving move nothing. */}
        <span className="mt-0.5 flex items-center gap-x-2 gap-y-0.5 text-xs text-muted max-sm:flex-col max-sm:items-start sm:h-4">
          <span className="flex h-4 flex-none items-center">
            {mastery !== null ? (
              <MasteryMeter value={mastery} align="left" />
            ) : (
              <Skeleton className="h-4 w-[5.5rem]" />
            )}
          </span>
          <span className="h-4 max-w-full min-w-0 truncate">{exam}</span>
        </span>
      </div>
      {failed ? (
        <span className="text-sm text-muted">No se pudo cargar.</span>
      ) : counts && base ? (
        left > 0 ? (
          <span className="text-sm text-muted">
            <DayLoad counts={counts} medianAnswerMs={base.plan.medianAnswerMs} detail />
          </span>
        ) : null
      ) : (
        <Skeleton className="h-5 w-24" />
      )}
      {!counts && !failed ? (
        // Not yet «Estudiar»: to somebody with nothing turned on, it would turn into «Elegir qué estudiar».
        <Skeleton className="h-10 w-28 max-sm:ml-auto" />
      ) : counts && left === 0 ? (
        nothingActive ? (
          <Link
            to={paths.course(node.ref.course)}
            className={`${button.base} ${button.secondary} max-sm:ml-auto`}
          >
            Elegir qué estudiar
          </Link>
        ) : (
          <span className="text-sm text-muted max-sm:ml-auto">Listo por hoy</span>
        )
      ) : failed ? null : (
        <Link
          to={paths.deckStudy(node.ref)}
          className={`${button.base} ${button.primary} max-sm:ml-auto`}
        >
          <Play className="size-4" aria-hidden="true" /> Estudiar
        </Link>
      )}
    </li>
  );
}

// «Seguir» ----------------------------------------------------------------------------------------------------------

function Follow({
  catalog,
  rounds,
}: {
  catalog: Catalog;
  rounds: { quizId: string; sectionId: string; answered: number; questionCount: number }[];
}) {
  type Item = { key: string; icon: ReactNode; title: string; detail: string; to: string };
  const tests: Item[] = [];
  for (const r of rounds) {
    const found = findQuiz(catalog, r.quizId);
    if (!found) continue;
    tests.push({
      key: `quiz:${r.quizId}:${r.sectionId}`,
      icon: <ListChecks className="size-5" aria-hidden="true" />,
      title: found.quiz.title,
      detail: `Test a medias · ${r.answered} de ${r.questionCount}`,
      to: paths.quiz(found.course, found.quiz, found.quiz.sectionCount > 1 ? r.sectionId : null),
    });
    if (tests.length === 2) break;
  }
  const note = lastNote();
  const located = note ? locateNote(catalog, 'slug', note) : null;
  // At most two: the latest test and the last note, or two tests.
  const items = located ? tests.slice(0, 1) : tests;
  if (located) {
    items.push({
      key: `note:${located.note.slug}`,
      icon: <BookOpen className="size-5" aria-hidden="true" />,
      title: located.note.title,
      detail: `Último apunte que abriste · ${located.course.name}`,
      to: paths.note(located.course, located.note.slug),
    });
  }
  // Nothing to follow: no room taken.
  if (!items.length) return null;
  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="follow">
      <h2 id="follow" className="font-serif text-xl font-semibold">
        Seguir
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.key} className="min-w-0">
            <Link to={it.to} className={`${linkCard} group flex items-center gap-3 p-4`}>
              <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand">
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{it.title}</span>
                <span className="block truncate text-sm text-muted">{it.detail}</span>
              </span>
              <ArrowRight
                className="size-4 flex-none text-muted transition group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function findQuiz(catalog: Catalog, quizId: string) {
  for (const s of catalog.semesters) {
    for (const course of s.courses) {
      for (const a of course.assessments) {
        const quiz = a.quizzes.find((q) => q.id === quizId);
        if (quiz) return { course, quiz };
      }
    }
  }
  return null;
}

// «Tus ramos» -------------------------------------------------------------------------------------------------------

function MyCourses({
  catalog,
  prefs,
  courses,
  onChange,
}: {
  catalog: Catalog;
  prefs: StudyPreferences;
  courses: MyCourseLists;
  onChange: (prefs: StudyPreferences) => void;
}) {
  const semesterName = new Map(catalog.semesters.map((s) => [s.number, s.name]));
  const options = [
    ...(prefs.semester === null ? [{ value: '', label: 'Elige tu semestre' }] : []),
    ...catalog.semesters
      .filter((s) => s.courses.length > 0)
      .map((s) => ({ value: String(s.number), label: s.name })),
  ];
  const addable = courses.addable.map((c) => ({
    value: c.id,
    label: `${c.emoji} ${c.name} · ${semesterName.get(c.semester) ?? ''}`,
  }));
  const nothing = !courses.cards.length && !courses.soon.length;
  // «Agregar un ramo»: where the focus goes after a course is taken out (its card, with its ✕, is gone). It may still be
  // disabled when the ✕ is pressed (nothing else to add): the focus goes when it can take it.
  const addBox = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus) return;
    const button = addBox.current?.querySelector('button');
    if (button && !button.disabled) {
      button.focus();
      setRefocus(false);
    }
  }, [refocus, addable.length]);
  return (
    <section className="mt-8 scroll-mt-24 sm:mt-10" id="tus-ramos" aria-labelledby="my-courses">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="my-courses" className="font-serif text-xl font-semibold">
          Tus ramos
        </h2>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden="true">¿En qué semestre estás?</span>
          <Select
            label="¿En qué semestre estás?"
            value={prefs.semester === null ? '' : String(prefs.semester)}
            options={options}
            onChange={(v) => {
              if (v) onChange({ ...prefs, semester: Number(v) });
            }}
            className="w-48"
          />
        </div>
      </div>
      {/* Above the list: adding or taking out a course never moves the controls just used. */}
      <div className="mt-3" ref={addBox}>
        <Select
          label="Agregar un ramo de otro semestre"
          placeholder={
            addable.length ? 'Agregar un ramo de otro semestre' : 'No hay más ramos con material'
          }
          value=""
          options={addable}
          onChange={(id) => onChange(addCourse(prefs, id))}
          disabled={!addable.length}
          className="w-full sm:w-80"
        />
      </div>
      {nothing ? (
        <p className="mt-3 text-sm text-muted">
          Elige tu semestre o agrega un ramo, y aquí aparecen, con sus apuntes, tests y tarjetas.
        </p>
      ) : null}
      {courses.cards.length ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {courses.cards.map((c) => (
            <li key={c.id} className="relative min-w-0">
              <CourseCard catalog={catalog} course={c} />
              <button
                type="button"
                aria-label={`Quitar ${c.name} de tus ramos`}
                onClick={() => {
                  onChange(removeCourse(prefs, c.id));
                  // Its card is gone: the focus goes to «Agregar un ramo», where it can come back from.
                  setRefocus(true);
                }}
                className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {courses.soon.length ? (
        // The courses still without material, in one line rather than cards (the owner's decision of the review).
        <p className="mt-3 text-sm text-muted">
          Próximamente: {listText(courses.soon.map((c) => c.name))}.
        </p>
      ) : null}
    </section>
  );
}

/** A course of «Tus ramos», to its page; its ✕ goes beside it, outside the link. */
function CourseCard({ catalog, course }: { catalog: Catalog; course: CourseWithAssessments }) {
  const material = materialLabel(countNotes(course), countDecks(catalog, course.id));
  return (
    <Link
      to={paths.course(course)}
      className={`${linkCard} group flex items-center gap-3 p-4 pr-12`}
    >
      <span className="text-2xl" aria-hidden="true">
        {course.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{course.name}</span>
        <span className="block truncate text-sm text-muted">{material}</span>
      </span>
      <ArrowRight
        className="size-4 flex-none text-muted transition group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
