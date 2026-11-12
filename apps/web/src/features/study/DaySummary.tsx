import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dayStartsAt } from '@qv/srs';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { Skeleton } from '../../ui/Loading';
import { ancestry, descendants } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { scopeNodeOf, unitOf } from '../cards/scope';
import { isoOfDay } from '../stats/heatmap';
import { heatmapKeys } from '../stats/queries';
import { correctPercent, daySummary } from './day-summary';
import { studyKeys } from './queries';
import type { StudyPreferences } from './repository';
import { timingFor } from './scheduler';

/** Each «Listo por hoy» reads its own summary: coming back to it after more answers never shows the old one. */
let visits = 0;

/**
 * The summary of «Listo por hoy» (step 3.4, ANK-15): today's answers and «% bien» in what was being studied, from
 * review_log once the session's answers are saved, the streak of «Días de estudio» (`study_heatmap()`, every course,
 * as the home page) with the course's under it (the owner asked for both), and «Ver las que fallaste» if there was one. It has its whole height from the first frame (the
 * figures wait in their places), so nothing moves when they arrive.
 */
export function DaySummary({
  node,
  prefs,
  saved,
}: {
  node: CourseDeckNode;
  prefs: StudyPreferences;
  /** Resolves once every answer of the session is in the database. */
  saved: () => Promise<unknown>;
}) {
  const { study } = useServices();
  const client = useQueryClient();
  const [visit] = useState(() => ++visits);
  const query = useQuery({
    queryKey: [...studyKeys.all, 'day-summary', node.id, visit],
    queryFn: async () => {
      // A failed save stops the session and says so: the summary shows what the database has.
      await saved().catch(() => undefined);
      const { today } = timingFor(prefs);
      const from = new Date(dayStartsAt(today, prefs.timeZone, prefs.dayStartsAt) * 1000);
      const to = new Date(dayStartsAt(today + 1, prefs.timeZone, prefs.dayStartsAt) * 1000);
      const [answers, heat] = await Promise.all([
        study.ratedBetween(from, to),
        // The home page's own reading, read again: it already has today's answers.
        client.fetchQuery({
          queryKey: heatmapKeys.scope('all'),
          queryFn: () => study.heatmap(null),
          staleTime: 0,
        }),
      ]);
      const decks = new Set(descendants(node).map((n) => n.id));
      // The course's decks, as its page counts them: its streak goes under the whole one.
      const course = ancestry(node).find((n) => n.depth === 2) ?? null;
      const courseDecks = course ? new Set(descendants(course).map((n) => n.id)) : null;
      return { today, summary: daySummary(answers, decks, heat, today, courseDecks) };
    },
    gcTime: 0,
    staleTime: Infinity,
  });

  const data = query.data;
  const summary = data?.summary;
  const percent = summary ? correctPercent(summary) : null;
  const days = (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'día' : 'días'}`;
  const items: [string, string | null][] = [
    ['Respuestas hoy', summary ? summary.answers.toLocaleString('es-CL') : null],
    ['Bien', summary ? (percent === null ? '—' : `${percent} %`) : null],
    ['Racha actual', summary ? days(summary.streak) : null],
  ];
  // Under the whole streak, the course's: its line is there from the first frame (empty while it loads).
  const courseLine =
    summary && summary.courseStreak !== null
      ? `${summary.courseStreak.toLocaleString('es-CL')} en el ramo`
      : '';

  // The failed cards in the cards page of this deck's assessment (or course), only this deck's week or lecture.
  const scope = node.depth > 3 ? (scopeNodeOf(node) ?? node) : node;
  const unit = scope === node ? null : unitOf(scope, node);
  const failedLink =
    data && summary && summary.failedCards > 0
      ? paths.cards(scope.ref, { unit, day: isoOfDay(data.today), state: 'failed' })
      : null;

  return (
    <section aria-label="Resumen de hoy" className="mt-6 w-full max-w-sm">
      <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface py-3">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 px-2">
            <dt className="truncate text-xs text-muted">{label}</dt>
            <dd className="mt-1 flex h-7 items-center justify-center truncate text-lg font-semibold text-ink tabular-nums">
              {value ?? (query.isError ? '—' : <Skeleton className="h-5 w-12" />)}
            </dd>
            {label === 'Racha actual' ? (
              <dd className="h-4 truncate text-xs text-muted tabular-nums">{courseLine}</dd>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="mt-2 flex h-5 items-center justify-center text-sm">
        {failedLink ? (
          <Link to={failedLink} className="text-brand hover:underline">
            Ver las que fallaste
          </Link>
        ) : query.isError ? (
          <span className="truncate text-muted">
            No se pudo leer el resumen.{' '}
            <button type="button" onClick={() => void query.refetch()} className="underline">
              Reintentar
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );
}
