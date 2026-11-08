import { ArrowRight, BookOpen, Play } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '../../app/paths';
import type { Catalog, SemesterWithCourses } from '@qv/schema';
import { ErrorWithRetry } from '../../ui/Notice';
import { Skeleton } from '../../ui/Loading';
import { button, card, linkCard, page } from '../../ui/styles';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { useDeck } from '../decks/queries';
import { CountNumbers, DayLoad, useDeckCounts } from '../study/DeckCounts';
import { MasteryMeter } from '../study/MasteryMeter';
import { nearestExamText } from '../study/pace';
import { usePreferences, useToday } from '../study/queries';
import { activeUnits } from '../study/simple';
import { buildAnkiTree, courseDeck, descendants } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { useUser } from '../session/context';
import {
  MORE_SEMESTERS_SOON,
  countDecks,
  countNotes,
  materialLabel,
  useCatalog,
  yearOfSemester,
} from './queries';

const YEARS = ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo'];

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
      ) : !catalog.data ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <Today catalog={catalog.data} />
          <Semesters catalog={catalog.data} />
        </>
      )}
    </div>
  );
}

function Semesters({ catalog }: { catalog: Catalog }) {
  const byYear = new Map<number, SemesterWithCourses[]>();
  for (const s of catalog.semesters) {
    const y = yearOfSemester(s.number);
    byYear.set(y, [...(byYear.get(y) ?? []), s]);
  }
  return (
    <section className="mt-12" aria-labelledby="degree">
      <h2 id="degree" className="text-sm font-semibold tracking-wide text-muted uppercase">
        La carrera
      </h2>
      <div className="mt-3 space-y-8">
        {[...byYear].map(([year, semesters]) => (
          <div key={year}>
            <h3 className="mb-3 font-serif text-xl font-semibold">
              {YEARS[year - 1] ?? `${year}.º`} año
            </h3>
            <ul className="grid gap-4 sm:grid-cols-2">
              {semesters.map((s) => (
                <li key={s.number}>
                  <SemesterCard semester={s} catalog={catalog} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* The semesters without material, when the site hides them: one line in their place. */}
      {catalog.hiddenSemesters ? <p className="mt-8 text-muted">{MORE_SEMESTERS_SOON}</p> : null}
    </section>
  );
}

function SemesterCard({ semester, catalog }: { semester: SemesterWithCourses; catalog: Catalog }) {
  const notes = semester.courses.reduce((t, c) => t + countNotes(c), 0);
  const decks = semester.courses.reduce((t, c) => t + countDecks(catalog, c.id), 0);
  if (!semester.courses.length) {
    return (
      <div className={`${card} border-dashed p-5 opacity-70 shadow-none`}>
        <p className="font-semibold">{semester.name}</p>
        <p className="mt-1 text-sm text-muted">Pronto.</p>
      </div>
    );
  }
  return (
    <Link to={paths.semester(semester.number)} className={`${linkCard} group p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{semester.name}</p>
        <ArrowRight
          className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {semester.courses.map((c) => (
          <li key={c.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
            {c.emoji} {c.name}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <BookOpen className="size-3.5" aria-hidden="true" />
        {materialLabel(notes, decks) || 'Apuntes en camino'}
      </p>
    </Link>
  );
}

/**
 * «Hoy»: what is left today in Anki, course by course (each course on its own: they are not studied
 * together), with «Estudiar». Only the courses that have decks.
 */
function Today({ catalog }: { catalog: Catalog }) {
  const tree = buildAnkiTree(catalog);
  const decks = catalog.semesters
    .flatMap((s) => s.courses)
    .map((c) => courseDeck(tree, c.id))
    .filter((n): n is CourseDeckNode => n !== null);
  if (!decks.length) return null;
  return (
    <section className={`${card} mt-8 p-4 sm:p-6`} aria-labelledby="today">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today" className="font-serif text-xl font-semibold">
          Hoy en Anki
        </h2>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {decks.map((n) => (
          <TodayRow key={n.id} node={n} />
        ))}
      </ul>
    </section>
  );
}

function TodayRow({ node }: { node: CourseDeckNode }) {
  const deck = useDeck(node.id);
  const { counts, mastery, error, data } = useDeckCounts(deck.data);
  const own = counts?.get(node.id);
  const course = node.course;
  const left = own ? own.new + own.learning + own.review : 0;
  const plan = data ? data.plan : null;
  const nothingActive = !!plan && activeUnits(descendants(node), plan).size === 0;
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const failed = deck.error || error;
  const exam =
    plan && today !== null
      ? nearestExamText(
          data!.decks,
          plan,
          data!.progress ?? [],
          node.children.map((c) => c.id),
          today,
          data!.prefs,
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
        {/* On the phone the summary has its line: beside the bar it would be cut off. */}
        <span className="mt-0.5 flex items-center gap-x-2 gap-y-0.5 text-xs text-muted max-sm:flex-col max-sm:items-start sm:h-4">
          <span className="flex h-4 flex-none items-center">
            {mastery ? (
              <MasteryMeter value={mastery.get(node.id) ?? 0} align="left" />
            ) : (
              <Skeleton className="h-4 w-[5.5rem]" />
            )}
          </span>
          <span className="h-4 max-w-full min-w-0 truncate">{exam}</span>
        </span>
      </div>
      {failed ? (
        <span className="text-sm text-muted">No se pudo cargar.</span>
      ) : own ? (
        plan ? (
          left > 0 ? (
            <span className="text-sm text-muted">
              <DayLoad counts={own} medianAnswerMs={plan.medianAnswerMs} detail />
            </span>
          ) : null
        ) : (
          <CountNumbers counts={own} />
        )
      ) : (
        <Skeleton className="h-5 w-24" />
      )}
      {!own && !failed ? (
        // Not yet «Estudiar»: to somebody with nothing turned on, it would turn into «Elegir qué estudiar».
        <Skeleton className="h-10 w-28 max-sm:ml-auto" />
      ) : own && left === 0 ? (
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
      ) : (
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
