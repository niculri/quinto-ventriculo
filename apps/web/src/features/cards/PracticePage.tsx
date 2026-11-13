import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { paths } from '../../app/paths';
import { BackButton } from '../../ui/BackButton';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { answerBar, button, studyScreen } from '../../ui/styles';
import { useAnkiTree } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { usePracticeRecorder } from '../stats/practice';
import { ReviewMenu, ReviewScreen, RoundDone } from '../study/FinalReviewPage';
import { startRound } from '../study/final-review';
import type { Round } from '../study/final-review';
import { useNow } from '../study/queries';
import type { CardRef } from '../study/repository';
import { queryOf } from './CardsPage';
import {
  NO_FILTERS,
  applyFilters,
  groupNotes,
  parseKind,
  parseOrigins,
  parseState,
  practiceCards,
  searchQuery,
} from './model';
import { failedOf, useCardsData, useDayCards, useFailed, useTextMatch } from './queries';
import { cardsScope, unitDeckIds, unitNode } from './scope';

/**
 * «Practicar estas» (`…/cards/practice?<the list's filters>`; step 3.3, ANK-12): a round with the cards the list found,
 * also those not seen yet, with the final review's motor. It changes no date and writes nothing of the cards: each
 * answer counts as practice for the heatmap and the streak (`record_practice()`). The filters are in the URL, so
 * reloading starts the same round again.
 */
export function PracticePage({ node }: { node: CourseDeckNode }) {
  const { catalog, tree } = useAnkiTree();
  const [params] = useSearchParams();
  const scope = useMemo(
    () => (catalog.data ? cardsScope(catalog.data, node) : null),
    [catalog.data, node],
  );
  const now = useNow(60_000);
  const cards = useCardsData(scope, tree, now);
  const data = cards.data;
  const failed = useFailed(data?.prefs, now);
  const q = params.get('q') ?? '';
  const text = useTextMatch(data, searchQuery(q, !!data?.prefs.fullAnki), tree);
  const day = useDayCards(scope, data, params.get('day'));
  const state = parseState(params.get('state'));
  const queue = useMemo(() => {
    const failedCards = failedOf(day.value, failed.data);
    if (!data || !scope || !failedCards || text.waiting || day.waiting) return null;
    const unit = unitNode(scope.node, params.get('unit') ?? '');
    const { matched } = applyFilters(data.notes, {
      ...NO_FILTERS,
      unitDecks: unitDeckIds(unit),
      text: text.keys,
      day: day.value?.keys ?? null,
      failed: failedCards,
      state,
      origins: parseOrigins(params.get('origin')),
      kind: parseKind(params.get('kind')),
    });
    return practiceCards(groupNotes(matched), state);
  }, [data, scope, failed.data, text, day, state, params]);

  // The round starts from what the list had when it was opened: practicing changes nothing of it.
  const [first, setFirst] = useState<CardRef[] | null>(null);
  if (first === null && queue) setFirst(queue);

  const back = paths.cards(node.ref, queryOf(params));
  useEffect(() => {
    document.title = 'Practicar · El Quinto Ventrículo';
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, []);

  let body;
  if (cards.error && !data) body = <ErrorWithRetry error={cards.error} onRetry={cards.retry} />;
  else if (cards.missing || cards.changed) body = <Empty back={back} />;
  else if (!first) body = <Loading text="Preparando las tarjetas…" />;
  else if (!first.length) body = <Empty back={back} />;
  else body = <Practice cards={first} back={back} />;
  return (
    <div className={studyScreen}>
      {first && first.length ? (
        body
      ) : (
        <>
          <div className={`${answerBar} min-h-11 pb-2`}>
            <BackButton to={back} label="Tarjetas" className="justify-self-start" />
            <p className="text-center text-sm font-medium sm:text-base">Practicar</p>
            <span />
          </div>
          {body}
        </>
      )}
    </div>
  );
}

function Empty({ back }: { back: string }) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-2 py-6">
      <h1 className="font-serif text-2xl font-semibold">Nada que practicar</h1>
      <p className="mt-2 text-muted">Ninguna tarjeta coincide con estos filtros.</p>
      <Link to={back} className={`${button.base} ${button.primary} mt-6`}>
        Volver a las tarjetas
      </Link>
    </div>
  );
}

function Practice({ cards, back }: { cards: CardRef[]; back: string }) {
  const [round, setRound] = useState<Round>(() => startRound(cards));
  const { add, flush } = usePracticeRecorder();
  const finished = !round.queue[0];
  useEffect(() => {
    if (finished) flush();
  }, [finished, flush]);
  const current = round.queue[0];
  return (
    <>
      <div className={`${answerBar} min-h-11 pb-2`}>
        <BackButton to={back} label="Tarjetas" className="justify-self-start" />
        <p className="min-w-0 truncate text-center text-sm font-medium tabular-nums sm:text-base">
          {current ? (
            <>
              {/* On the phone the sides of the bar leave little room: only what is left. */}
              <span className="sm:hidden">Quedan {round.queue.length.toLocaleString('es-CL')}</span>
              <span className="hidden sm:inline">
                Practicar · quedan {round.queue.length.toLocaleString('es-CL')}
              </span>
            </>
          ) : (
            'Practicar'
          )}
        </p>
        <div className="flex min-w-0 items-center justify-end">
          {current ? (
            <ReviewMenu current={current} flag={0} onMarked={() => {}} markable={false} />
          ) : (
            <span className="w-10" aria-hidden="true" />
          )}
        </div>
      </div>
      {current ? (
        <>
          <p className="sr-only">Esta práctica no cambia las fechas de tus tarjetas.</p>
          <ReviewScreen round={round} current={current} onChange={setRound} onAnswer={add} />
        </>
      ) : (
        <RoundDone
          round={round}
          deckPath={back}
          label="las tarjetas"
          title="Terminaste la práctica"
          againLabel="Practicar de nuevo"
          onAgain={() => setRound(startRound(cards))}
        />
      )}
    </>
  );
}
