import { useState } from 'react';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { FEW } from '@qv/schema';
import type {
  Catalog,
  SearchContext,
  UsageCount,
  UsageFigures,
  UsageOpenFigures,
  UsageReport,
} from '@qv/schema';
import { paths } from '../../app/paths';
import { formatDateTime } from '../../lib/dates';
import { Skeleton } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { Reserved } from '../../ui/Reserved';
import { Select } from '../../ui/Select';
import { card } from '../../ui/styles';
import { buildAnkiTree, hasPage } from '../anki/tree';
import { findCourse, locateNote, useCatalog } from '../catalog/queries';
import { AdminSectionTitle } from './AdminLayout';
import { useUsageReport } from './queries';

/** Cloudflare Web Analytics of the account (the visits and the pages): the panel opens the account's own. */
export const WEB_ANALYTICS_URL = 'https://dash.cloudflare.com/?to=/:account/web-analytics';

const NUMBER = new Intl.NumberFormat('es-CL');
const SHORT_DAY = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortDay = (day: string) => SHORT_DAY.format(new Date(`${day}T12:00:00Z`));

/**
 * A figure. One that counts students and is 1 to 4 says «menos de 5»; any other that is not shown exact (it comes from
 * 1 to 4 students, or 1 to 4 opens, or it would give one of those by subtraction: null) is «—».
 */
function figure(v: UsageCount | null, students = false): string {
  if (v === null) return '—';
  if (v === FEW) return students ? 'menos de 5' : '—';
  return NUMBER.format(v);
}

type FigureKey = keyof UsageFigures;
type OpenKey = keyof UsageOpenFigures;

const ROWS: { key: FigureKey; label: string; students?: boolean }[] = [
  { key: 'activeStudents', label: 'Alumnos activos', students: true },
  { key: 'newStudents', label: 'Alumnos nuevos', students: true },
  { key: 'ankiAnswers', label: 'Respuestas de Anki' },
  { key: 'newCards', label: 'Tarjetas nuevas vistas' },
  { key: 'roundsStarted', label: 'Rondas de tests empezadas' },
  { key: 'roundsFinished', label: 'Rondas de tests terminadas' },
];
const OPEN_ROWS: { key: OpenKey; label: string }[] = [
  { key: 'notes', label: 'Apuntes abiertos' },
  { key: 'decks', label: 'Mazos abiertos' },
  { key: 'quizzes', label: 'Tests abiertos' },
  { key: 'searches', label: 'Búsquedas' },
];
const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'last7', label: '7 días' },
  { key: 'last30', label: '30 días' },
] as const;

const CONTEXTS: Record<SearchContext, string> = {
  home: 'Inicio',
  course: 'Un ramo o certamen',
  note: 'Un apunte',
  deck: 'Un mazo',
  quiz: 'Un test',
  search: 'La página de búsqueda',
  other: 'Otras páginas',
};

/**
 * «Administración» → «Uso» (step 2.9): how much the site is used, always in figures of 5 students or more (fewer is
 * «menos de 5»), never who. On top today, 7 and 30 days; then by day or week, the most used, by course and assessment,
 * the activation and the invited. The visits and the pages are Cloudflare's (Web Analytics), not here.
 */
export function UsagePage() {
  const usage = useUsageReport();
  const catalog = useCatalog();
  const data = usage.data && catalog.data ? { usage: usage.data, catalog: catalog.data } : null;
  return (
    <>
      <AdminSectionTitle title="Uso">
        <a
          href={WEB_ANALYTICS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          Visitas y páginas en Cloudflare
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </AdminSectionTitle>
      <p className="mt-2 text-sm text-muted">
        Cifras que suman a los alumnos, sin decir quiénes. Una cifra de 1 a 4 alumnos dice «menos de
        5», y una que sale de 1 a 4 alumnos (o de 1 a 4 aperturas) va como «—». Los días son de
        Santiago y empiezan a las 4:00, como en Anki.
      </p>
      {usage.isError || catalog.isError ? (
        <div className="mt-6">
          <ErrorWithRetry
            error={usage.error ?? catalog.error}
            onRetry={() => void Promise.all([usage.refetch(), catalog.refetch()])}
          />
        </div>
      ) : (
        <>
          <Summary report={data?.usage ?? null} />
          <Chart report={data?.usage ?? null} />
          {data ? <Details report={data.usage} catalog={data.catalog} /> : <DetailsLoading />}
        </>
      )}
    </>
  );
}

/** Today, 7 and 30 days: a row for each figure, the same rows while it loads. */
function Summary({ report }: { report: UsageReport | null }) {
  const opens = report?.opens ?? null;
  const status = report
    ? report.opensStatus === 'not_configured'
      ? 'Las aperturas y las búsquedas no están configuradas en este sitio.'
      : report.opensStatus === 'unavailable'
        ? 'No se pudieron leer las aperturas y las búsquedas. Intenta de nuevo en un rato.'
        : `Al ${formatDateTime(report.generatedAt)}.`
    : '';
  return (
    <section aria-labelledby="usage-summary" className="mt-6">
      <h3 id="usage-summary" className="sr-only">
        Resumen
      </h3>
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">
                <span className="sr-only">Cifra</span>
              </th>
              {PERIODS.map((p) => (
                <th
                  key={p.key}
                  scope="col"
                  className="w-[18%] px-1.5 py-2.5 text-right font-medium sm:w-[22%] sm:px-2"
                >
                  {p.label}
                </th>
              ))}
              <th aria-hidden="true" className="w-2 sm:w-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <SummaryRow key={row.key} label={row.label}>
                {PERIODS.map((p) =>
                  report ? figure(report.totals[p.key][row.key], row.students) : null,
                )}
              </SummaryRow>
            ))}
            {OPEN_ROWS.map((row) => (
              <SummaryRow key={row.key} label={row.label}>
                {PERIODS.map((p) =>
                  report ? (opens ? figure(opens.totals[p.key][row.key]) : '—') : null,
                )}
              </SummaryRow>
            ))}
          </tbody>
        </table>
        <Reserved
          longest="No se pudieron leer las aperturas y las búsquedas. Intenta de nuevo en un rato."
          className="border-t border-border px-4 py-2.5 text-xs sm:px-5"
        >
          <p role="status" className="text-muted">
            {status}
          </p>
        </Reserved>
      </div>
    </section>
  );
}

function SummaryRow({ label, children }: { label: string; children: (string | null)[] }) {
  return (
    <tr className="h-10">
      <th
        scope="row"
        className="py-2 pr-2 pl-4 text-left leading-snug font-normal text-ink sm:pl-5"
      >
        {label}
      </th>
      {children.map((v, i) => (
        <td key={i} className="px-1.5 text-right whitespace-nowrap text-ink tabular-nums sm:px-2">
          {v === null ? <Skeleton className="ml-auto h-4 w-10" /> : v}
        </td>
      ))}
      <td aria-hidden="true" />
    </tr>
  );
}

type Metric = FigureKey | OpenKey;
type Period = 'day' | 'week';

const isOpenKey = (m: Metric): m is OpenKey => OPEN_ROWS.some((r) => r.key === m);

/** One figure by day (30) or by week (12), as bars: «menos de 5» is a short gray bar. */
function Chart({ report }: { report: UsageReport | null }) {
  const [metric, setMetric] = useState<Metric>('activeStudents');
  const [period, setPeriod] = useState<Period>('day');
  const opens = report?.opens ?? null;
  const metrics = [
    ...ROWS.map((r) => ({ value: r.key as Metric, label: r.label })),
    ...(opens ? OPEN_ROWS.map((r) => ({ value: r.key as Metric, label: r.label })) : []),
  ];
  // The opens are kept by day only.
  const byWeek = period === 'week' && !isOpenKey(metric);
  const students = ROWS.find((r) => r.key === metric)?.students ?? false;
  const points: { label: string; value: UsageCount }[] = !report
    ? []
    : isOpenKey(metric)
      ? (opens?.days ?? []).map((d) => ({ label: d.day, value: d[metric] }))
      : byWeek
        ? report.weeks.map((w) => ({ label: w.week, value: w[metric] }))
        : report.days.map((d) => ({ label: d.day, value: d[metric] }));
  const max = Math.max(1, ...points.map((p) => (p.value === FEW ? 0 : p.value)));
  const name = metrics.find((m) => m.value === metric)?.label ?? '';
  return (
    <section aria-labelledby="usage-chart" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="usage-chart" className="text-lg font-semibold">
          {byWeek ? 'Por semana' : 'Por día'}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Select
            label="Cifra"
            value={metric}
            options={metrics}
            onChange={setMetric}
            disabled={!report}
            className="w-60"
          />
          <Select
            label="Periodo"
            value={isOpenKey(metric) ? 'day' : period}
            options={[
              { value: 'day', label: 'Últimos 30 días' },
              { value: 'week', label: 'Últimas 12 semanas' },
            ]}
            onChange={setPeriod}
            disabled={!report || isOpenKey(metric)}
            className="w-48"
          />
        </div>
      </div>
      <div className={`${card} mt-3 px-4 pt-4 pb-3 sm:px-5`}>
        {/* Always this high, with or without the figures. */}
        <ol
          aria-label={`${name}, ${byWeek ? 'por semana' : 'por día'}`}
          className="flex h-40 items-end gap-[2px] sm:gap-1"
        >
          {points.length
            ? points.map((p) => (
                <li
                  key={p.label}
                  className="flex h-full min-w-0 flex-1 items-end"
                  title={`${byWeek ? 'Semana del ' : ''}${shortDay(p.label)}: ${figure(p.value, students)}`}
                >
                  <span className="sr-only">
                    {byWeek ? 'Semana del ' : ''}
                    {shortDay(p.label)}: {figure(p.value, students)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`block w-full rounded-t-sm ${p.value === FEW ? 'bg-border-strong' : 'bg-brand'}`}
                    style={{
                      height:
                        p.value === FEW
                          ? '4%'
                          : `${p.value === 0 ? 0 : Math.max(2, (100 * p.value) / max)}%`,
                    }}
                  />
                </li>
              ))
            : null}
        </ol>
        <div className="mt-2 flex justify-between text-xs text-muted tabular-nums">
          <Reserved longest="30 sept." className="text-left">
            <span>{points[0] ? shortDay(points[0].label) : ''}</span>
          </Reserved>
          <Reserved longest={`máx. ${NUMBER.format(100000)}`} className="text-center">
            <span>{points.length ? `máx. ${NUMBER.format(max)}` : ''}</span>
          </Reserved>
          <Reserved longest="30 sept." className="text-right">
            <span>{points.at(-1) ? shortDay(points.at(-1)!.label) : ''}</span>
          </Reserved>
        </div>
      </div>
    </section>
  );
}

/**
 * What there is below the chart while it loads: the same headings, with rows of gray. The first one has the id of the
 * real one, so that the e2e test follows it from the first frame.
 */
function DetailsLoading() {
  return (
    <div className="mt-8 min-h-[40rem]">
      {['Lo más usado en 30 días', 'Por ramo y certamen en 30 días', 'Activación', 'Invitados'].map(
        (t, i) => (
          <section key={t} className="mt-8 first:mt-0">
            <h3 id={i === 0 ? 'usage-top' : undefined} className="text-lg font-semibold">
              {t}
            </h3>
            <div className={`${card} mt-3 space-y-3 px-4 py-4 sm:px-5`}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </section>
        ),
      )}
    </div>
  );
}

interface Named {
  name: string;
  detail: string | null;
  to: string | null;
}

/** A deck by its id: its name, its course and its page (or its nearest deck with one). */
function deckNamed(tree: ReturnType<typeof buildAnkiTree>, id: string): Named {
  const node = tree.byId.get(id);
  if (!node) return { name: `Mazo ${id}`, detail: null, to: null };
  let withPage = node;
  while (!hasPage(withPage) && withPage.parent) withPage = withPage.parent;
  return {
    name: node.label,
    detail: node.course?.name ?? null,
    to: hasPage(withPage) ? paths.deck(withPage.ref) : null,
  };
}

function quizNamed(catalog: Catalog, id: string): Named {
  for (const s of catalog.semesters) {
    for (const course of s.courses) {
      for (const a of course.assessments) {
        const q = a.quizzes.find((x) => x.id === id);
        if (q) return { name: q.title, detail: course.name, to: paths.quiz(course, q) };
      }
    }
  }
  return { name: id, detail: null, to: null };
}

function noteNamed(catalog: Catalog, slug: string): Named {
  const found = locateNote(catalog, 'slug', slug);
  return found
    ? {
        name: found.note.title,
        detail: found.course.name,
        to: paths.note(found.course, found.note.slug),
      }
    : { name: slug, detail: null, to: null };
}

function Details({ report, catalog }: { report: UsageReport; catalog: Catalog }) {
  const tree = buildAnkiTree(catalog);
  const opens = report.opens;
  const KIND = { note: 'Apunte', deck: 'Mazo', quiz: 'Test' } as const;
  return (
    <>
      <section aria-labelledby="usage-top" className="mt-8">
        <h3 id="usage-top" className="text-lg font-semibold">
          Lo más usado en 30 días
        </h3>
        <p className="mt-1 text-sm text-muted">
          Solo lo que usaron 5 alumnos o más (en las aperturas, lo que se abrió 5 veces o más).
        </p>
        <div className="mt-3 grid gap-4">
          <Table
            title="Mazos"
            empty="Ningún mazo con 5 alumnos o más."
            columns={['Alumnos', 'Respuestas', 'Tarjetas nuevas']}
            rows={report.decks.map((d) => ({
              key: d.deckId,
              named: deckNamed(tree, d.deckId),
              values: [figure(d.students, true), figure(d.answers), figure(d.newCards)],
            }))}
          />
          <Table
            title="Tests"
            empty="Ningún test con 5 alumnos o más."
            columns={['Alumnos', 'Rondas', 'Terminadas']}
            rows={report.quizzes.map((q) => ({
              key: q.quizId,
              named: quizNamed(catalog, q.quizId),
              values: [figure(q.students, true), figure(q.roundsStarted), figure(q.roundsFinished)],
            }))}
          />
          {opens ? (
            <>
              <Table
                title="Lo más abierto"
                empty="Nada abierto 5 veces o más, o menos de 5 alumnos activos en estos días."
                columns={['Qué es', 'Aperturas']}
                rows={opens.top.map((t) => ({
                  key: `${t.kind}:${t.id}`,
                  named:
                    t.kind === 'note'
                      ? noteNamed(catalog, t.id)
                      : t.kind === 'deck'
                        ? deckNamed(tree, t.id)
                        : quizNamed(catalog, t.id),
                  values: [KIND[t.kind], figure(t.opens)],
                }))}
              />
              <Table
                title="Búsquedas, según desde dónde se buscó"
                empty="Ninguna búsqueda, o menos de 5 alumnos activos en estos días."
                columns={['Búsquedas']}
                rows={opens.searches.map((s) => ({
                  key: s.context,
                  named: { name: CONTEXTS[s.context], detail: null, to: null },
                  values: [figure(s.count)],
                }))}
              />
            </>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="usage-courses" className="mt-8">
        <h3 id="usage-courses" className="text-lg font-semibold">
          Por ramo y certamen en 30 días
        </h3>
        <div className="mt-3">
          <Table
            title="Ramos y certámenes"
            hideTitle
            empty="Ningún ramo con 5 alumnos o más."
            columns={['Alumnos', 'Respuestas', 'Rondas']}
            rows={report.courses.flatMap((c) => {
              const found = findCourse(catalog, c.courseId);
              const course = found?.course ?? null;
              return [
                {
                  key: c.courseId,
                  named: {
                    name: course?.name ?? c.courseId,
                    detail: null,
                    to: course ? paths.course(course) : null,
                  },
                  values: [
                    figure(c.students, true),
                    figure(c.ankiAnswers),
                    figure(c.roundsStarted),
                  ],
                },
                ...report.assessments
                  .filter((a) => a.courseId === c.courseId)
                  .map((a) => {
                    const assessment = course?.assessments.find((x) => x.id === a.assessmentId);
                    return {
                      key: a.assessmentId,
                      indent: true,
                      named: {
                        name: assessment?.name ?? a.assessmentId,
                        detail: null,
                        to: course ? paths.assessment(course, a.assessmentId) : null,
                      },
                      values: [
                        figure(a.students, true),
                        figure(a.ankiAnswers),
                        figure(a.roundsStarted),
                      ],
                    };
                  }),
              ];
            })}
          />
        </div>
      </section>

      <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-4">
        <section aria-labelledby="usage-activation">
          <h3 id="usage-activation" className="text-lg font-semibold">
            Activación
          </h3>
          <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
            <p className="font-serif text-3xl font-semibold tabular-nums">
              {report.activation.percent === null ? '—' : `${report.activation.percent} %`}
            </p>
            <p className="mt-1 text-sm text-muted">
              de las cuentas con 7 días o más respondió una tarjeta o una pregunta en sus primeros 7
              días.
            </p>
            <Pairs
              items={[
                ['Cuentas con 7 días o más', figure(report.activation.eligible, true)],
                ['Respondieron a tiempo', figure(report.activation.activated, true)],
                ['No respondieron a tiempo', figure(report.activation.notActivated, true)],
              ]}
            />
          </div>
        </section>
        <section aria-labelledby="usage-invited">
          <h3 id="usage-invited" className="text-lg font-semibold">
            Invitados
          </h3>
          <div className={`${card} mt-3 px-4 py-4 sm:px-5`}>
            <Pairs
              items={[
                ['Entraron alguna vez', figure(report.invited.signedIn, true)],
                ['Nunca entraron', figure(report.invited.never, true)],
              ]}
            />
            <p className="mt-3 text-sm text-muted">
              Quiénes son está en{' '}
              <Link to={paths.adminAccess} className="text-brand underline underline-offset-2">
                Acceso
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function Pairs({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-3 divide-y divide-border text-sm first:mt-0">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-2">
          <dt className="text-muted">{label}</dt>
          <dd className="text-ink tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({
  title,
  hideTitle = false,
  empty,
  columns,
  rows,
}: {
  title: string;
  hideTitle?: boolean;
  empty: string;
  columns: string[];
  rows: { key: string; named: Named; values: ReactNode[]; indent?: boolean }[];
}) {
  return (
    <div className={`${card} overflow-hidden`}>
      {hideTitle ? null : (
        <h4 className="border-b border-border px-4 py-2.5 text-sm font-semibold sm:px-5">
          {title}
        </h4>
      )}
      {rows.length ? (
        <table className="w-full text-sm sm:table-fixed">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5">
                <span className="sr-only">Nombre</span>
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-1.5 py-2 text-right leading-tight font-medium sm:w-[19%] sm:px-2"
                >
                  {c}
                </th>
              ))}
              <th aria-hidden="true" className="w-2 sm:w-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                {/* On the phone the table sizes its columns by their content: `w-full max-w-0` gives the name what the
                    figures leave, so that the course's line (one line, cut) does not push the figures out of the card. */}
                <th
                  scope="row"
                  className={`min-w-0 py-2.5 pr-2 text-left font-normal max-sm:w-full max-sm:max-w-0 ${r.indent ? 'pl-8 sm:pl-10' : 'pl-4 sm:pl-5'}`}
                >
                  {/* Two lines on the phone rather than cut: the table comes whole with its figures. */}
                  <span className="line-clamp-2 break-words">
                    {r.named.to ? (
                      <Link to={r.named.to} className="text-ink hover:text-brand hover:underline">
                        {r.named.name}
                      </Link>
                    ) : (
                      r.named.name
                    )}
                  </span>
                  {r.named.detail ? (
                    <span className="block truncate text-xs text-muted">{r.named.detail}</span>
                  ) : null}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="px-1.5 text-right whitespace-nowrap tabular-nums sm:px-2">
                    {v}
                  </td>
                ))}
                <td aria-hidden="true" />
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-3 text-sm text-muted sm:px-5">{empty}</p>
      )}
    </div>
  );
}
