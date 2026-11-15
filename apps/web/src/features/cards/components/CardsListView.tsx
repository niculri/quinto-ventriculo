// The cards page's list with its count and «Practicar estas»; while a reading the filters need is on its way, the
// list's places (an empty list first, then the cards, would move).

import { Link } from 'react-router';
import { Dumbbell } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { Notice } from '../../../shared/ui/Notice';
import { button } from '../../../shared/ui/styles';
import type { CardsScope } from '../../catalog/model/scope';
import { cardCount } from '../model/practice';
import type { Matched } from '../model/filters';
import { queryOf } from '../model/urlState';
import { failedOf } from '../model/dayCards';
import type { CardsBodyState } from '../hooks/useCardsBody';
import { CardList, notesText } from './CardList';
import { ListSkeleton } from './ListSkeleton';

const cardsText = (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'tarjeta' : 'tarjetas'}`;

export function CardsListView({
  b,
  scope,
  onOpen,
  reveal,
}: {
  b: CardsBodyState;
  scope: CardsScope;
  onOpen: (m: Matched) => void;
  reveal: string | null;
}) {
  const { state, day, failed, text, result } = b;
  // «Falladas» waits for the answers that say which: an empty list first, then the cards, would move.
  const failedWaiting = state === 'failed' && !failedOf(day.value, failed.data) && !failed.isError;
  const shown = text.waiting || day.waiting || failedWaiting ? null : result;
  const waiting = shown === null;
  return (
    <>
      <div className="mt-3 flex h-10 items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm text-muted tabular-nums" aria-live="polite">
          {shown === null ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            `${notesText(shown.matched.length)} · ${cardsText(cardCount(shown.matched))}`
          )}
        </div>
        {b.practice.length && !waiting ? (
          <Link
            to={paths.cardsPractice(scope.node.ref, queryOf(b.params))}
            className={`${button.base} ${button.primary} h-10 flex-none py-0`}
          >
            <Dumbbell className="size-4" aria-hidden="true" /> Practicar estas
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={`${button.base} ${button.primary} h-10 flex-none py-0 opacity-50`}
          >
            <Dumbbell className="size-4" aria-hidden="true" /> Practicar estas
          </span>
        )}
      </div>
      {text.error ? (
        <div className="mt-2">
          <Notice title="No se entiende la búsqueda">{text.error}</Notice>
        </div>
      ) : null}
      {shown === null ? (
        <ListSkeleton />
      ) : shown.matched.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">
          Ninguna tarjeta coincide con estos filtros.
        </p>
      ) : (
        <CardList
          lectures={b.lectures}
          lectureTitle={b.lectureTitles}
          hideAnswers={b.hideAnswers}
          thumbs={b.thumbs}
          onOpen={onOpen}
          reveal={reveal}
        />
      )}
    </>
  );
}
