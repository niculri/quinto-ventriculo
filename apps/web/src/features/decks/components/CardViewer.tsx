// A modal card viewer as in Anki: front, «Mostrar respuesta», back, with arrows through a list and a line of actions.

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { CardSummary } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { Loading } from '../../../shared/ui/Loading';
import { button } from '../../../shared/ui/styles';
import { CardFrame } from './CardFrame';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { cardLabel } from '../model/labels';
import { cardQuery } from '../api/queries';
import { useCard } from '../hooks/useCard';
import { DimBackdrop } from '../../../shared/ui/Dialog';
import { viewerKeyDown } from './viewerKeys';
import { decksStrings as s } from '../strings';

interface Props {
  cards: CardSummary[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  actions?: ReactNode;
}

export function CardViewer({ cards, index, onIndexChange, onClose, actions }: Props) {
  const current = cards[index]!;
  const key = `${current.noteGuid}/${current.ord}`;
  const [answerOf, setAnswerOf] = useState<string | null>(null);
  const showAnswer = answerOf === key;
  const toggleAnswer = () => setAnswerOf((k) => (k === key ? null : key));
  const card = useCard(current.noteGuid, current.ord);
  const night = useDarkMode();
  const api = useApi();
  const client = useQueryClient();
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = cards[index + 1];
    if (next) void client.prefetchQuery(cardQuery(api, next.noteGuid, next.ord));
  }, [api, cards, client, index]);

  const go = (delta: number) => {
    const i = index + delta;
    if (i >= 0 && i < cards.length) onIndexChange(i);
  };

  const onKeyDown = (e: KeyboardEvent) => viewerKeyDown(e, content.current, toggleAnswer, go);

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? null : onClose())}>
      <Dialog.Portal>
        <DimBackdrop />
        <Dialog.Content
          aria-describedby={undefined}
          ref={content}
          tabIndex={-1}
          style={{ outline: 'none' }}
          // Focus on the viewer itself, not on «Cerrar»: so space shows the answer, as in Anki.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-x-auto sm:top-[3dvh] sm:left-1/2 sm:h-[94dvh] sm:w-[min(58rem,94vw)] sm:-translate-x-1/2 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-soft"
        >
          <ViewerHeader current={current} index={index} total={cards.length} />

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="card-scroll">
            {card.isError ? (
              <ErrorWithRetry error={card.error} onRetry={() => void card.refetch()} />
            ) : !card.data ? (
              <Loading text={s.viewer.loading} />
            ) : (
              <CardFrame
                key={`${key}/${showAnswer ? 'a' : 'q'}`}
                html={showAnswer ? card.data.back : card.data.front}
                css={card.data.css}
                ord={card.data.ord}
                night={night}
                occlusion={card.data.kind === 'occlusion'}
                label={showAnswer ? s.viewer.back : s.viewer.front}
              />
            )}
          </div>

          <ViewerFooter
            onPrevious={() => go(-1)}
            onNext={() => go(1)}
            onToggle={toggleAnswer}
            first={index === 0}
            last={index === cards.length - 1}
            ready={!!card.data}
            showAnswer={showAnswer}
          />
          {actions ? (
            <div
              role="toolbar"
              aria-label={s.viewer.actions}
              className="flex h-12 flex-none items-center gap-1 overflow-x-auto border-t border-border px-2 sm:px-3"
            >
              {actions}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ViewerHeader({
  current,
  index,
  total,
}: {
  current: CardSummary;
  index: number;
  total: number;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <Dialog.Title className="truncate text-sm font-semibold">{cardLabel(current)}</Dialog.Title>
        <p className="text-xs text-muted">
          {s.viewer.place(s.kinds[current.kind], index + 1, total)}
        </p>
      </div>
      <Dialog.Close
        aria-label={s.viewer.close}
        className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-5" aria-hidden="true" />
      </Dialog.Close>
    </header>
  );
}

function ViewerFooter({
  onPrevious,
  onNext,
  onToggle,
  first,
  last,
  ready,
  showAnswer,
}: {
  onPrevious: () => void;
  onNext: () => void;
  onToggle: () => void;
  first: boolean;
  last: boolean;
  ready: boolean;
  showAnswer: boolean;
}) {
  return (
    <footer className="flex items-center gap-2 border-t border-border px-3 py-3 sm:px-4">
      <button
        type="button"
        onClick={onPrevious}
        disabled={first}
        className={`${button.base} ${button.ghost}`}
        aria-label={s.viewer.previous}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{s.viewer.previousShort}</span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={`${button.base} ${button.primary} flex-1`}
        disabled={!ready}
      >
        {showAnswer ? s.viewer.showFront : s.viewer.showAnswer}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={last}
        className={`${button.base} ${button.ghost}`}
        aria-label={s.viewer.next}
      >
        <span className="hidden sm:inline">{s.viewer.nextShort}</span>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </footer>
  );
}
