// One assessment of the draft: its counts of articles, questions and cards, whom it reaches, and its changes by tab.
import { useState } from 'react';
import { lastName } from '@qv/release-review';
import type { DeckImpact, ReleaseAssessment, ReleaseOverview } from '@qv/schema';
import { Reserved } from '../../../../shared/ui/Reserved';
import { card } from '../../../../shared/ui/styles';
import { useReleaseImpact } from '../../hooks/useReleases';
import { assessmentTitle } from '../../model/releases';
import type { CountLine } from '../../model/releases';
import { releasesStrings } from '../../releases.strings';
import { ReleaseItems } from './ReleaseItems';
import type { ItemKind } from './ReleaseItems';

const s = releasesStrings.assessment;
const c = releasesStrings.counts;

export function AssessmentChanges({
  a,
  overview,
}: {
  a: ReleaseAssessment;
  overview: ReleaseOverview;
}) {
  const [open, setOpen] = useState<ItemKind | null>(null);
  const impact = useReleaseImpact(overview);
  const n = {
    article: a.articles.added + a.articles.removed + a.articles.content + a.articles.format,
    question: a.questions.total,
    card: a.cards.notes,
  };
  const reached = a.impactDecks.map((d) => ({ ...d, impact: impact.data?.get(d.id) }));
  const tab = (kind: ItemKind, label: string) =>
    n[kind] ? (
      <button
        type="button"
        aria-pressed={open === kind}
        onClick={() => setOpen((o) => (o === kind ? null : kind))}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          open === kind ? 'bg-brand-soft text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        {s.tab(label, n[kind])}
      </button>
    ) : null;
  return (
    <article aria-labelledby={`a-${a.id}`} className={`${card} p-4 sm:p-5`}>
      <h4 id={`a-${a.id}`} className="font-semibold">
        {assessmentTitle(a)}
      </h4>
      {a.suggestedDate ? (
        <p className="mt-0.5 text-xs text-muted">
          {s.suggested}
          {a.suggestedDate}
        </p>
      ) : null}
      <AssessmentCounts a={a} />
      {reached.length ? <Reach reached={reached} failed={impact.isError} /> : null}
      <div role="group" aria-label={s.tabs} className="mt-4 flex flex-wrap gap-1">
        {tab('article', s.articles)}
        {tab('question', s.questions)}
        {tab('card', s.cards)}
      </div>
      {open ? (
        <ReleaseItems kind={open} assessment={a.id} fingerprint={overview.summary.fingerprint} />
      ) : null}
    </article>
  );
}

function AssessmentCounts({ a }: { a: ReleaseAssessment }) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-3">
      <Counts
        title={s.articles}
        lines={[
          [a.articles.added, ...c.article.added],
          [a.articles.content, ...c.article.content],
          [a.articles.format, ...c.article.format],
          [a.articles.removed, ...c.article.removed],
        ]}
      />
      <Counts
        title={s.questions}
        lines={[
          [a.questions.added, ...c.question.added],
          [a.questions.keyChanged, ...c.question.keyChanged],
          [a.questions.answer, ...c.question.answer],
          [a.questions.noAnswer, ...c.question.noAnswer],
          [a.questions.format, ...c.question.format],
          [a.questions.moved, ...c.question.moved],
          [a.questions.removed, ...c.question.removed],
        ]}
      />
      <Counts
        title={s.cards}
        lines={[
          [a.cards.added, ...c.card.added],
          [a.cards.answer, ...c.card.answer],
          [a.cards.noAnswer, ...c.card.noAnswer],
          [a.cards.format, ...c.card.format],
          [a.cards.moved, ...c.card.moved],
          [a.cards.removed, ...c.card.removed],
        ]}
      />
    </div>
  );
}

function Counts({ title, lines }: { title: string; lines: CountLine[] }) {
  const shown = lines.filter(([count]) => count > 0);
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {shown.length ? (
          shown.map(([count, one, many]) => (
            <li key={one}>{releasesStrings.plural(count, one, many)}</li>
          ))
        ) : (
          <li>{s.noChanges}</li>
        )}
      </ul>
    </div>
  );
}

type Reached = ReleaseAssessment['impactDecks'][number] & { impact: DeckImpact | undefined };

function Reach({ reached, failed }: { reached: Reached[]; failed: boolean }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink">{s.reach}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {reached.map((d) => (
          <li key={d.id}>
            <Reserved longest={s.reachLongest(lastName(d.name ?? d.id))}>
              {s.deck(lastName(d.name ?? d.id))}
              {d.impact ? s.seen(d.impact.studentsSeen) : failed ? s.notCounted : s.counting}{' '}
              {s.reachCards(d.cards)}
            </Reserved>
          </li>
        ))}
      </ul>
    </div>
  );
}
