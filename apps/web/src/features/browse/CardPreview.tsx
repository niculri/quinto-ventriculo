import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, MessageSquareWarning } from 'lucide-react';
import { timeSpan } from '@qv/srs';
import type { SchedTiming } from '@qv/srs';
import { useServices } from '../../app/services';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { button } from '../../ui/styles';
import { CardFrame, useDarkMode } from '../decks/CardFrame';
import { useCard } from '../decks/queries';
import { ReportCardDialog } from '../admin/ReportCardDialog';
import { studyKeys } from '../study/queries';
import type { CardLogEntry } from '../study/repository';
import { cellText, recall, shortDate } from './data';
import type { BrowseCard } from './data';

/** The selected card as Anki's preview shows it (front or back), and its «Información de la tarjeta». */
export function CardPreview({
  card,
  timing,
  onEnlarge,
}: {
  card: BrowseCard;
  timing: SchedTiming;
  /** Opens the card in the viewer (as Anki's «Vista previa» window). */
  onEnlarge: () => void;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [reporting, setReporting] = useState(false);
  const [sent, setSent] = useState(false);
  const detail = useCard(card.noteGuid, card.ord);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div role="group" aria-label="Lado de la tarjeta" className="flex flex-wrap gap-1">
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
            {s === 'front' ? 'Frente' : 'Reverso'}
          </button>
        ))}
        <button
          type="button"
          onClick={onEnlarge}
          className={`${button.base} ${button.ghost} ml-auto px-3 py-1.5`}
        >
          <Maximize2 className="size-4" aria-hidden="true" /> Ver en grande
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
          <MessageSquareWarning className="size-3.5" aria-hidden="true" /> Reportar error
        </button>
        {sent ? (
          <p role="status" className="text-xs text-muted">
            Gracias: tu reporte le llegó al autor.
          </p>
        ) : null}
      </div>
      <CardInfo card={card} timing={timing} />
      {reporting ? (
        <ReportCardDialog
          card={{
            noteGuid: card.noteGuid,
            ord: card.ord,
            deckId: card.deckId,
            code: detail.data?.code ?? null,
            version: detail.data?.version ?? null,
          }}
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
  if (!detail.data) return <Loading text="Cargando la tarjeta…" />;
  return (
    <CardFrame
      html={side === 'front' ? detail.data.front : detail.data.back}
      css={detail.data.css}
      ord={detail.data.ord}
      night={night}
      occlusion={detail.data.kind === 'occlusion'}
      label={side === 'front' ? 'Frente de la tarjeta' : 'Reverso de la tarjeta'}
    />
  );
}

const RATING = ['Otra vez', 'Difícil', 'Bien', 'Fácil'];
const RATING_COLORS = [
  'text-[#c62828] dark:text-[#ff8a80]',
  'text-muted',
  'text-[#2e7d32] dark:text-[#85d08a]',
  'text-state-new',
];
const DATE_TIME = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Anki's revlog type of an answer: by the card's phase when it was answered. */
function kindOf(e: CardLogEntry): string {
  if (e.action === 'forget') return 'Manual';
  switch (e.phaseBefore) {
    case 'new':
    case 'learning':
      return 'Aprendizaje';
    case 'review':
      return 'Repaso';
    case 'relearning':
      return 'Reaprendizaje';
  }
}

/** Anki's «Información de la tarjeta»: the numbers of the card and its history of answers. */
export function CardInfo({ card, timing }: { card: BrowseCard; timing: SchedTiming }) {
  const { study } = useServices();
  const log = useQuery({
    queryKey: [...studyKeys.all, 'log', card.noteGuid, card.ord],
    queryFn: () => study.cardLog(card),
    staleTime: 30_000,
  });
  const answers = (log.data ?? []).filter((e) => e.rating !== null || e.action === 'forget');
  const timed = answers.filter((e) => e.durationMs !== null);
  const total = timed.reduce((t, e) => t + e.durationMs!, 0);
  const r = recall(card, timing);
  const first = answers.find((e) => e.rating !== null);
  const last = [...answers].reverse().find((e) => e.rating !== null);
  const facts: [string, string][] = [
    ['Agregada', card.createdMs === null ? '—' : shortDate(card.createdMs)],
    ['Primer repaso', first ? shortDate(Date.parse(first.reviewedAt)) : '—'],
    ['Último repaso', last ? shortDate(Date.parse(last.reviewedAt)) : '—'],
    ['Vencimiento', cellText(card, 'due', timing)],
    ['Intervalo', cellText(card, 'interval', timing)],
    ['Estabilidad', cellText(card, 'stability', timing) || '—'],
    ['Dificultad', cellText(card, 'difficulty', timing) || '—'],
    ['Recuperabilidad', r === null ? '—' : `${Math.round(r * 100)} %`],
    ['Repasos', String(card.reps)],
    ['Olvidos', String(card.lapses)],
    ['Tiempo promedio', timed.length ? timeSpan(total / timed.length / 1000) : '—'],
    ['Tiempo total', timed.length ? timeSpan(total / 1000) : '—'],
    ['Tarjeta', card.template],
    ['Tipo de nota', card.noteType?.name ?? '—'],
    ['Mazo', card.deck?.name.split('::').slice(1).join(' › ') || '—'],
    ['Código', cellText(card, 'code', timing) || '—'],
  ];
  return (
    <section aria-label="Información de la tarjeta" className="text-sm">
      <h3 className="mb-2 font-semibold">Información de la tarjeta</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mt-4 mb-1 font-semibold">Historial</h4>
      {log.isError ? (
        <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <Loading text="Cargando el historial…" />
      ) : answers.length === 0 ? (
        <p className="text-muted">Todavía no la has estudiado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Historial de repasos">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-2 font-medium">Fecha</th>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Botón</th>
                <th className="py-1 pr-2 font-medium">Intervalo</th>
                <th className="py-1 pr-2 font-medium">Estabilidad</th>
                <th className="py-1 font-medium">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {[...answers].reverse().map((e, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {DATE_TIME.format(new Date(e.reviewedAt))}
                  </td>
                  <td className="py-1 pr-2">{kindOf(e)}</td>
                  <td
                    className={`py-1 pr-2 font-medium ${e.rating ? RATING_COLORS[e.rating - 1] : ''}`}
                  >
                    {e.rating ? RATING[e.rating - 1] : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    {e.interval === null
                      ? '—'
                      : timeSpan(e.interval < 0 ? -e.interval : e.interval * 86_400)}
                  </td>
                  <td className="py-1 pr-2">
                    {e.stability === null ? '—' : timeSpan(e.stability * 86_400)}
                  </td>
                  <td className="py-1">
                    {e.durationMs === null ? '—' : timeSpan(e.durationMs / 1000)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
