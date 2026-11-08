import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { CardSummary } from '@qv/schema';
import { useServices } from '../../app/services';
import { ErrorWithRetry } from '../../ui/Notice';
import { Loading } from '../../ui/Loading';
import { button } from '../../ui/styles';
import { CardFrame, useDarkMode } from './CardFrame';
import { KIND_LABELS, cardLabel } from './labels';
import { cardQuery, useCard } from './queries';

interface Props {
  cards: CardSummary[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** The card as in Anki: front, «Mostrar respuesta», back. With arrows to move through the list. */
export function CardViewer({ cards, index, onIndexChange, onClose }: Props) {
  const current = cards[index]!;
  // The answer shown belongs to one card: moving to another one starts on its front.
  const key = `${current.noteGuid}/${current.ord}`;
  const [answerOf, setAnswerOf] = useState<string | null>(null);
  const showAnswer = answerOf === key;
  const toggleAnswer = () => setAnswerOf((k) => (k === key ? null : key));
  const card = useCard(current.noteGuid, current.ord);
  const night = useDarkMode();
  const { api } = useServices();
  const client = useQueryClient();
  const content = useRef<HTMLDivElement>(null);

  // The next card is fetched ahead.
  useEffect(() => {
    const next = cards[index + 1];
    if (next) void client.prefetchQuery(cardQuery(api, next.noteGuid, next.ord));
  }, [api, cards, client, index]);

  const go = (delta: number) => {
    const i = index + delta;
    if (i >= 0 && i < cards.length) onIndexChange(i);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // From inside the card's shadow root the target is its host: the element is the first of the path
    // (the «toggle» button of an occlusion, a hint link).
    const origin = e.nativeEvent.composedPath()[0] ?? e.target;
    const activates =
      origin instanceof Element &&
      origin.matches('button, a[href], summary, input, select, textarea');
    if (activates && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleAnswer();
    } else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          ref={content}
          tabIndex={-1}
          // The global :focus-visible ring would frame the whole viewer.
          style={{ outline: 'none' }}
          // Focus on the viewer itself, not on «Cerrar»: so space shows the answer, as in Anki.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-x-auto sm:top-[3dvh] sm:left-1/2 sm:h-[94dvh] sm:w-[min(58rem,94vw)] sm:-translate-x-1/2 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-soft"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold">
                {cardLabel(current)}
              </Dialog.Title>
              <p className="text-xs text-muted">
                {KIND_LABELS[current.kind]} · {index + 1} de {cards.length}
              </p>
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="card-scroll">
            {card.isError ? (
              <ErrorWithRetry error={card.error} onRetry={() => void card.refetch()} />
            ) : !card.data ? (
              <Loading text="Cargando la tarjeta…" />
            ) : (
              <CardFrame
                key={`${key}/${showAnswer ? 'a' : 'q'}`}
                html={showAnswer ? card.data.back : card.data.front}
                css={card.data.css}
                ord={card.data.ord}
                night={night}
                occlusion={card.data.kind === 'occlusion'}
                label={showAnswer ? 'Reverso de la tarjeta' : 'Frente de la tarjeta'}
              />
            )}
          </div>

          <footer className="flex items-center gap-2 border-t border-border px-3 py-3 sm:px-4">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className={`${button.base} ${button.ghost}`}
              aria-label="Tarjeta anterior"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Anterior</span>
            </button>
            <button
              type="button"
              onClick={toggleAnswer}
              className={`${button.base} ${button.primary} flex-1`}
              disabled={!card.data}
            >
              {showAnswer ? 'Ver el frente' : 'Mostrar respuesta'}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index === cards.length - 1}
              className={`${button.base} ${button.ghost}`}
              aria-label="Tarjeta siguiente"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
