// The statistics page under its title: the totals, the cards by state, the table by period, the chart of the last and
// next days and the hardest cards. While loading, every section keeps its place.

import type { ReactNode } from 'react';
import { useId } from 'react';
import type { CardStatsData } from '@qv/study';
import { card } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { descendants } from '../../catalog/model/tree';
import type { HardCardRow } from '../model/hardCards';
import { ActivityChart } from './ActivityChart';
import { CardStates } from './CardStates';
import { HardCards } from './HardCards';
import { PeriodTable } from './PeriodTable';
import { periodTableStrings } from './strings/PeriodTable.strings';
import { statsBodyStrings as s } from './strings/StatsBody.strings';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`${card} mt-6 p-4 sm:p-6`}>
      <h2 id={id} className="mb-3 font-serif text-lg font-semibold sm:text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StatsBody({
  node,
  data,
  advanced,
  hard,
}: {
  node: CourseDeckNode;
  data: CardStatsData | null;
  advanced: boolean;
  hard: HardCardRow[];
}) {
  const labels = new Map(descendants(node).map((n) => [n.id, n.label]));
  return (
    <>
      <p className="mt-3 line-clamp-2 h-10 text-sm text-muted tabular-nums sm:line-clamp-1 sm:h-5">
        {data
          ? s.total(data.total.answers, periodTableStrings.time(data.total.ms), data.total.days)
          : null}
      </p>
      <Section title={s.sections.cards}>
        <CardStates cards={data?.cards ?? null} total={node.cardCount} advanced={advanced} />
      </Section>
      <Section title={s.sections.periods}>
        <PeriodTable data={data} advanced={advanced} />
      </Section>
      <Section title={s.sections.activity}>
        <ActivityChart data={data} />
      </Section>
      <Section title={s.sections.hard}>
        <HardCards
          node={node}
          rows={hard}
          loading={!data}
          deckLabel={(id) => labels.get(id) ?? ''}
        />
      </Section>
      {advanced ? null : <p className="mt-4 text-xs text-muted">{s.advanced}</p>}
    </>
  );
}
