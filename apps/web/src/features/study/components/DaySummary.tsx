// The summary of «Listo por hoy»: today's answers and «% bien» from review_log, the streak of «Días de estudio» with
// the course's under it, and «Ver las que fallaste».

import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { paths } from '../../../shared/lib/paths';
import { useStudyRepository } from '../../progress/api/context';
import { Skeleton } from '../../../shared/ui/Loading';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { scopeNodeOf, unitOf } from '../../catalog/model/scope';
import { correctPercent, isoOfDay } from '@qv/study';
import type { StudyPreferences } from '../../progress/api/repository';
import { daySummaryQuery } from '../api/queries';
import { studyStrings } from '../strings';

/** Each «Listo por hoy» reads its own summary: coming back to it after more answers never shows the old one. */
let visits = 0;

/** It has its whole height from the first frame (the figures wait in their places), so nothing moves when they arrive. */
export function DaySummary({
  node,
  prefs,
  saved,
}: {
  node: CourseDeckNode;
  prefs: StudyPreferences;
  saved: () => Promise<unknown>;
}) {
  const study = useStudyRepository();
  const client = useQueryClient();
  const [visit] = useState(() => ++visits);
  const query = useQuery(daySummaryQuery({ study, client, node, prefs, saved, visit }));

  const data = query.data;
  const summary = data?.summary;
  const percent = summary ? correctPercent(summary) : null;
  const items: [string, string | null][] = [
    [studyStrings.summary.answers, summary ? summary.answers.toLocaleString('es-CL') : null],
    [studyStrings.summary.good, summary ? (percent === null ? '—' : `${percent} %`) : null],
    [studyStrings.summary.streak, summary ? studyStrings.summary.days(summary.streak) : null],
  ];
  const courseLine =
    summary && summary.courseStreak !== null
      ? studyStrings.summary.course(summary.courseStreak)
      : '';

  const scope = node.depth > 3 ? (scopeNodeOf(node) ?? node) : node;
  const unit = scope === node ? null : unitOf(scope, node);
  const failedLink =
    data && summary && summary.failedCards > 0
      ? paths.cards(scope.ref, { unit, day: isoOfDay(data.today), state: 'failed' })
      : null;

  return (
    <section aria-label={studyStrings.summary.region} className="mt-6 w-full max-w-sm">
      <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface py-3">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 px-2">
            <dt className="truncate text-xs text-muted">{label}</dt>
            <dd className="mt-1 flex h-7 items-center justify-center truncate text-lg font-semibold text-ink tabular-nums">
              {value ?? (query.isError ? '—' : <Skeleton className="h-5 w-12" />)}
            </dd>
            {label === studyStrings.summary.streak ? (
              <dd className="h-4 truncate text-xs text-muted tabular-nums">{courseLine}</dd>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="mt-2 flex h-5 items-center justify-center text-sm">
        {failedLink ? (
          <Link to={failedLink} className="text-brand hover:underline">
            {studyStrings.summary.failed}
          </Link>
        ) : query.isError ? (
          <span className="truncate text-muted">
            {studyStrings.summary.unread}{' '}
            <button type="button" onClick={() => void query.refetch()} className="underline">
              {studyStrings.summary.retry}
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );
}
