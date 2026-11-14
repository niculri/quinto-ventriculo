// The home page: first steps, «Hoy», «Seguir», the study heatmap and «Tus ramos». Its sections appear together, in a
// space as tall as the page was the last time on this device, so nothing moves while it loads.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, Check, ListChecks, Play, X } from 'lucide-react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Catalog, CourseWithAssessments } from '@qv/schema';
import type { Counts } from '@qv/srs';
import { paths } from '../../shared/lib/paths';
import { useQuizRepository } from '../quiz/api/context';
import type { QuizRepository } from '../quiz/api/repository';
import { Breadcrumbs } from '../../shared/ui/Breadcrumbs';
import { Skeleton } from '../../shared/ui/Loading';
import { ErrorWithRetry } from '../../shared/ui/Notice';
import { Select } from '../../shared/ui/Select';
import { button, card, linkCard, page } from '../../shared/ui/styles';
import { buildAnkiTree, courseDeck, descendants } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { countDecks, countNotes, locateNote, materialLabel, useCatalog } from '../catalog/queries';
import { useDeck } from '../decks/queries';
import { useUser } from '../session/context';
import { Heatmap } from '../stats/HeatmapCard';
import { activeUnits, homeCourseCounts, nearestExamText, totalCards } from '@qv/study';
import type { HomeStudyBase, StudyPlan } from '@qv/study';
import { DayLoad, useDeckCounts } from '../study/DeckCounts';
import { MasteryMeter } from '../study/MasteryMeter';
import { usePreferences, useSavePreferences, useStudyPlan, useToday } from '../study/queries';
import type { StudyPreferences } from '../study/api/repository';
import { lastNote } from '../notes/lastNote';
import { addCourse, listText, myCourses, removeCourse } from './myCourses';
import type { MyCourses as MyCourseLists } from './myCourses';
import { todayCourses, useCountsTick, useHomeStudy } from './queries';

const HEIGHT_KEY = 'qv-home-height';
const DEFAULT_HEIGHT = 1100;
const FIRST_STEPS = 'first-steps';

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

function useOpenRounds() {
  const quiz = useQuizRepository();
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
  // Once shown it stays: a later refetch changes what is inside, never the whole page.
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
      // blocked storage
    }
  });
  if (plan.isError)
    return <ErrorWithRetry error={plan.error} onRetry={() => void plan.refetch()} />;
  if (!ready) {
    return (
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
  rounds: Awaited<ReturnType<QuizRepository['openRounds']>>;
}) {
  // What the student chooses shows at once, while it is saved.
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
  const withDecks = mine.cards.filter((c) => courseDeck(tree, c.id));
  const choose = withDecks.length >= 1 ? paths.course(withDecks[0]!) : '#tus-ramos';
  const steps = {
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

/** A row for when homeCourseCounts() cannot know the new cards: it reads its deck, as the course's page does. */
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
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <Link
          to={paths.course(node.ref.course)}
          className="block truncate font-medium hover:underline"
        >
          <span aria-hidden="true">{course?.emoji}</span> {course?.name ?? node.label}
        </Link>
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
  // After a course is taken out the focus goes to «Agregar un ramo», as soon as it is enabled.
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
        <p className="mt-3 text-sm text-muted">
          Próximamente: {listText(courses.soon.map((c) => c.name))}.
        </p>
      ) : null}
    </section>
  );
}

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
