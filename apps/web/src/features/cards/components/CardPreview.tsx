// The browser's preview of the selected card (front or back) and Anki's «Información de la tarjeta».

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, MessageSquareWarning } from 'lucide-react';
import { timeSpan } from '@qv/srs';
import type { SchedTiming } from '@qv/srs';
import { useStudyRepository } from '../../progress/api/context';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import { CardFrame } from '../../decks/CardFrame';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { useCard } from '../../decks/queries';
import { ReportDialog } from '../../reports/ReportDialog';
import { cardTarget } from '../../reports/targets';
import { cellText, recall, shortDate } from '../model/browseCards';
import { cardLogQuery } from '../api/queries';
import { CardHistory } from './CardHistory';
import type { BrowseCard } from '../model/browseCards';
import { sharedStrings } from '../../../shared/strings';
import { cardsStrings } from '../strings';

export function CardPreview({
  card,
  timing,
  onEnlarge,
}: {
  card: BrowseCard;
  timing: SchedTiming;
  onEnlarge: () => void;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [reporting, setReporting] = useState(false);
  const [sent, setSent] = useState(false);
  const detail = useCard(card.noteGuid, card.ord);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div role="group" aria-label={cardsStrings.preview.side} className="flex flex-wrap gap-1">
        {(['front', 'back'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={`${button.base} px-3 py-1.5 ${
              side === s ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'
            }`}
          >
            {s === 'front' ? cardsStrings.preview.front : cardsStrings.preview.back}
          </button>
        ))}
        <button
          type="button"
          onClick={onEnlarge}
          className={`${button.base} ${button.ghost} ml-auto px-3 py-1.5`}
        >
          <Maximize2 className="size-4" aria-hidden="true" /> {cardsStrings.preview.enlarge}
        </button>
      </div>
      <div className="h-80 overflow-hidden rounded-xl border border-border">
        <PreviewSide key={`${card.key}/${side}`} card={card} side={side} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setReporting(true);
          }}
          className={`${button.base} ${button.ghost} px-2 py-1 text-xs`}
        >
          <MessageSquareWarning className="size-3.5" aria-hidden="true" />{' '}
          {cardsStrings.reportError}
        </button>
        {sent ? (
          <p role="status" className="text-xs text-muted">
            {sharedStrings.reportThanks}
          </p>
        ) : null}
      </div>
      <CardInfo card={card} timing={timing} />
      {reporting ? (
        <ReportDialog
          target={cardTarget({
            noteGuid: card.noteGuid,
            ord: card.ord,
            deckId: card.deckId,
            code: detail.data?.code ?? null,
            version: detail.data?.version ?? null,
          })}
          onClose={() => setReporting(false)}
          onSent={() => {
            setReporting(false);
            setSent(true);
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewSide({ card, side }: { card: BrowseCard; side: 'front' | 'back' }) {
  const detail = useCard(card.noteGuid, card.ord);
  const night = useDarkMode();
  if (detail.isError) {
    return <ErrorWithRetry error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  if (!detail.data) return <Loading text={cardsStrings.preview.loading} />;
  return (
    <CardFrame
      html={side === 'front' ? detail.data.front : detail.data.back}
      css={detail.data.css}
      ord={detail.data.ord}
      night={night}
      occlusion={detail.data.kind === 'occlusion'}
      label={side === 'front' ? cardsStrings.frontOfCard : cardsStrings.backOfCard}
    />
  );
}

type Fact = keyof typeof cardsStrings.info.facts;

const SIMPLE = new Set<Fact>(['firstReview', 'lastReview', 'due', 'reps', 'lapses']);

export function CardInfo({
  card,
  timing,
  simple = false,
}: {
  card: BrowseCard;
  timing: SchedTiming;
  simple?: boolean;
}) {
  const study = useStudyRepository();
  const log = useQuery(cardLogQuery(study, card));
  const answers = (log.data ?? []).filter((e) => e.rating !== null || e.action === 'forget');
  const timed = answers.filter((e) => e.durationMs !== null);
  const total = timed.reduce((t, e) => t + e.durationMs!, 0);
  const r = recall(card, timing);
  const first = answers.find((e) => e.rating !== null);
  const last = [...answers].reverse().find((e) => e.rating !== null);
  const none = cardsStrings.info.none;
  const facts: [Fact, string][] = [
    ['added', card.createdMs === null ? none : shortDate(card.createdMs)],
    ['firstReview', first ? shortDate(Date.parse(first.reviewedAt)) : none],
    ['lastReview', last ? shortDate(Date.parse(last.reviewedAt)) : none],
    ['due', cellText(card, 'due', timing)],
    ['interval', cellText(card, 'interval', timing)],
    ['stability', cellText(card, 'stability', timing) || none],
    ['difficulty', cellText(card, 'difficulty', timing) || none],
    ['recall', r === null ? none : `${Math.round(r * 100)} %`],
    ['reps', String(card.reps)],
    ['lapses', String(card.lapses)],
    ['meanTime', timed.length ? timeSpan(total / timed.length / 1000) : none],
    ['totalTime', timed.length ? timeSpan(total / 1000) : none],
    ['card', card.template],
    ['noteType', card.noteType?.name ?? none],
    ['deck', card.deck?.name.split('::').slice(1).join(' › ') || none],
    ['code', cellText(card, 'code', timing) || none],
  ];
  const shown = simple ? facts.filter(([k]) => SIMPLE.has(k)) : facts;
  return (
    <section aria-label={cardsStrings.info.title} className="text-sm">
      {simple ? null : <h3 className="mb-2 font-semibold">{cardsStrings.info.title}</h3>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{cardsStrings.info.facts[k]}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <CardHistory log={log} answers={answers} />
    </section>
  );
}
