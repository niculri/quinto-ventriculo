// One assessment of the draft: its counts of articles, questions and cards, whom it reaches, and its changes by tab.
import { useState } from 'react';
import { lastName } from '@qv/release-review';
import type { DeckImpact, ReleaseAssessment, ReleaseOverview } from '@qv/schema';
import { plural } from '../../../../shared/lib/plural';
import { Reserved } from '../../../../shared/ui/Reserved';
import { card } from '../../../../shared/ui/styles';
import { useReleaseImpact } from '../../hooks/useReleases';
import { assessmentTitle } from '../../model/releases';
import type { CountLine } from '../../model/releases';
import { assessmentChangesStrings } from './strings/AssessmentChanges.strings';
import { ReleaseItems } from './ReleaseItems';
import type { ItemKind } from './ReleaseItems';

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
        {assessmentChangesStrings.assessment.tab(label, n[kind])}
      </button>
    ) : null;
  return (
    <article aria-labelledby={`a-${a.id}`} className={`${card} p-4 sm:p-5`}>
      <h4 id={`a-${a.id}`} className="font-semibold">
        {assessmentTitle(a)}
      </h4>
      {a.suggestedDate ? (
        <p className="mt-0.5 text-xs text-muted">
          {assessmentChangesStrings.assessment.suggested}
          {a.suggestedDate}
        </p>
      ) : null}
      <AssessmentCounts a={a} />
      {reached.length ? <Reach reached={reached} failed={impact.isError} /> : null}
      <div
        role="group"
        aria-label={assessmentChangesStrings.assessment.tabs}
        className="mt-4 flex flex-wrap gap-1"
      >
        {tab('article', assessmentChangesStrings.assessment.articles)}
        {tab('question', assessmentChangesStrings.assessment.questions)}
        {tab('card', assessmentChangesStrings.assessment.cards)}
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
        title={assessmentChangesStrings.assessment.articles}
        lines={[
          [a.articles.added, ...assessmentChangesStrings.counts.article.added],
          [a.articles.content, ...assessmentChangesStrings.counts.article.content],
          [a.articles.format, ...assessmentChangesStrings.counts.article.format],
          [a.articles.removed, ...assessmentChangesStrings.counts.article.removed],
        ]}
      />
      <Counts
        title={assessmentChangesStrings.assessment.questions}
        lines={[
          [a.questions.added, ...assessmentChangesStrings.counts.question.added],
          [a.questions.keyChanged, ...assessmentChangesStrings.counts.question.keyChanged],
          [a.questions.answer, ...assessmentChangesStrings.counts.question.answer],
          [a.questions.noAnswer, ...assessmentChangesStrings.counts.question.noAnswer],
          [a.questions.format, ...assessmentChangesStrings.counts.question.format],
          [a.questions.moved, ...assessmentChangesStrings.counts.question.moved],
          [a.questions.removed, ...assessmentChangesStrings.counts.question.removed],
        ]}
      />
      <Counts
        title={assessmentChangesStrings.assessment.cards}
        lines={[
          [a.cards.added, ...assessmentChangesStrings.counts.card.added],
          [a.cards.answer, ...assessmentChangesStrings.counts.card.answer],
          [a.cards.noAnswer, ...assessmentChangesStrings.counts.card.noAnswer],
          [a.cards.format, ...assessmentChangesStrings.counts.card.format],
          [a.cards.moved, ...assessmentChangesStrings.counts.card.moved],
          [a.cards.removed, ...assessmentChangesStrings.counts.card.removed],
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
          shown.map(([count, one, many]) => <li key={one}>{plural(count, one, many)}</li>)
        ) : (
          <li>{assessmentChangesStrings.assessment.noChanges}</li>
        )}
      </ul>
    </div>
  );
}

type Reached = ReleaseAssessment['impactDecks'][number] & { impact: DeckImpact | undefined };

function Reach({ reached, failed }: { reached: Reached[]; failed: boolean }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink">{assessmentChangesStrings.assessment.reach}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {reached.map((d) => (
          <li key={d.id}>
            <Reserved
              longest={assessmentChangesStrings.assessment.reachLongest(lastName(d.name ?? d.id))}
            >
              {assessmentChangesStrings.assessment.deck(lastName(d.name ?? d.id))}
              {d.impact
                ? assessmentChangesStrings.assessment.seen(d.impact.studentsSeen)
                : failed
                  ? assessmentChangesStrings.assessment.notCounted
                  : assessmentChangesStrings.assessment.counting}{' '}
              {assessmentChangesStrings.assessment.reachCards(d.cards)}
            </Reserved>
          </li>
        ))}
      </ul>
    </div>
  );
}
