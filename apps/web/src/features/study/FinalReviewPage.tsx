import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Flag,
  ListChecks,
  MessageSquareWarning,
  MoreHorizontal,
  PartyPopper,
} from 'lucide-react';
import type { DeckDetail } from '@qv/schema';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { ApiRequestError } from '../../lib/api';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { answerBar, button, card } from '../../ui/styles';
import { studyBackLabel } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import { BackButton } from '../../ui/BackButton';
import { useDarkMode } from '../decks/CardFrame';
import { cardQuery, useDeck } from '../decks/queries';
import { answerRound, dropCurrent, revealCard, reviewPools, startRound } from './final-review';
import type { Round } from './final-review';
import { useCardMaterial } from './material';
import { studyKeys, useStudyData } from './queries';
import type { CardKey, CardRef } from './repository';
import { cardKey } from './scheduler';
import type { StudyData } from './scheduler';
import { MaterialLink, RATINGS, ReportEntry, StudyCard } from './StudyPage';
import { useCountOpen } from '../usage/count';
import { usePracticeRecorder } from '../stats/practice';

/** «Marcar para revisar» is one flag, as when studying. */
const REVIEW_FLAG = 1;

/** The final review of an assessment (`…/anki/<assessment>/review`): no menu, as studying. */
export function FinalReviewPage({ node }: { node: CourseDeckNode }) {
  const deck = useDeck(node.id);
  // «Uso» (step 2.9): a deck's page, its study and its final review are what open a deck.
  useCountOpen('deck', deck.data ? node.id : null);
  if (deck.isError) {
    if (deck.error instanceof ApiRequestError && [400, 404].includes(deck.error.status)) {
      return <NotFoundPage />;
    }
    return <ErrorWithRetry error={deck.error} onRetry={() => void deck.refetch()} />;
  }
  if (!deck.data) return <Loading text="Preparando el mazo…" />;
  return <FinalReviewLoader node={node} deck={deck.data} />;
}

function FinalReviewLoader({ node, deck }: { node: CourseDeckNode; deck: DeckDetail }) {
  const study = useStudyData(deck);
  const client = useQueryClient();
  // From «Listo por hoy», what is in memory is from before that session: it is read again before saying anything.
  // (Its last answers may still be on their way; when they arrive, the lists to choose from follow.)
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    void client
      .refetchQueries({ queryKey: studyKeys.all, type: 'active' })
      .finally(() => setFresh(true));
  }, [client]);
  // At the start of a new day what is read changes its key and is missing for a moment: a round in progress goes on.
  const [last, setLast] = useState<StudyData | null>(null);
  if (study.data && study.data !== last) setLast(study.data);
  const data = study.data ?? last;
  if (study.error && !data) return <ErrorWithRetry error={study.error} onRetry={study.retry} />;
  if (!data || !fresh) return <Loading text="Preparando tus tarjetas…" />;
  return <FinalReview node={node} data={data} />;
}

function FinalReview({ node, data }: { node: CourseDeckNode; data: StudyData }) {
  const [round, setRound] = useState<Round | null>(null);
  // The marks changed here: nothing else changes while reviewing.
  const [marks, setMarks] = useState<ReadonlyMap<string, number>>(new Map());
  // Only to choose: a mark made in a round counts for the next one.
  const choosing = round === null;
  const pools = useMemo(
    () => (choosing ? reviewPools(data, marks) : { all: [], hard: [] }),
    [choosing, data, marks],
  );
  const deckPath = paths.deck(node.ref);
  const client = useQueryClient();
  const marked = useRef(false);
  // Each answer is practice: it counts in the heatmap and the streak, without changing any date.
  const { add: addPractice, flush: flushPractice } = usePracticeRecorder();
  const finished = !!round && !round.queue[0];
  useEffect(() => {
    if (finished) flushPractice();
  }, [finished, flushPractice]);

  useEffect(() => {
    document.title = `Repaso final de ${node.label} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
      // Only a mark can have changed something.
      if (marked.current) void client.invalidateQueries({ queryKey: studyKeys.all });
    };
  }, [client, node.label]);

  const left = round ? round.queue.length : null;
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-1px)] max-w-5xl flex-col px-2 pt-2 sm:px-4 sm:pt-3">
      <div className={`${answerBar} min-h-11 pb-2`}>
        <BackButton to={deckPath} label={studyBackLabel(node)} className="justify-self-start" />
        <p className="min-w-0 truncate text-center text-sm font-medium tabular-nums sm:text-base">
          {left ? `Repaso final · quedan ${left.toLocaleString('es-CL')}` : 'Repaso final'}
        </p>
        <div className="flex min-w-0 items-center justify-end">
          {round && round.queue[0] ? (
            <ReviewMenu
              current={round.queue[0]}
              flag={
                marks.get(cardKey(round.queue[0])) ??
                data.rows.get(cardKey(round.queue[0]))?.flag ??
                0
              }
              onMarked={(key, flag) => {
                marked.current = true;
                setMarks((m) => new Map(m).set(key, flag));
              }}
            />
          ) : (
            <span className="w-10" aria-hidden="true" />
          )}
        </div>
      </div>
      {!round ? (
        <ChooseReview node={node} pools={pools} onChoose={(cards) => setRound(startRound(cards))} />
      ) : round.queue[0] ? (
        <ReviewScreen
          round={round}
          onChange={setRound}
          onAnswer={addPractice}
          current={round.queue[0]}
        />
      ) : (
        <RoundDone
          round={round}
          deckPath={deckPath}
          label={node.label}
          onAgain={() => setRound(null)}
        />
      )}
    </div>
  );
}

/** What to review. It says once, here, that no date changes. */
function ChooseReview({
  node,
  pools,
  onChoose,
}: {
  node: CourseDeckNode;
  pools: { all: CardRef[]; hard: CardRef[] };
  onChoose: (cards: CardRef[]) => void;
}) {
  const option = (title: string, text: string, cards: CardRef[], count = cards.length) => (
    <button
      type="button"
      disabled={count === 0}
      onClick={() => onChoose(cards)}
      className={`${card} block w-full p-4 text-left transition hover:border-border-strong disabled:pointer-events-none disabled:opacity-60`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className="flex-none text-sm text-muted tabular-nums">
          {count.toLocaleString('es-CL')} {count === 1 ? 'tarjeta' : 'tarjetas'}
        </span>
      </span>
      <span className="mt-1 block text-sm text-muted">{text}</span>
    </button>
  );
  return (
    <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-2 py-6">
      <h1 className="font-serif text-2xl font-semibold">Repaso final de {node.label}</h1>
      {pools.all.length === 0 ? (
        <>
          <p className="mt-2 text-muted">
            Todavía no has visto tarjetas de este certamen. Cuando estudies algunas, podrás
            repasarlas aquí.
          </p>
          <Link to={paths.deck(node.ref)} className={`${button.base} ${button.primary} mt-6`}>
            Volver a {node.label}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">Este repaso no cambia las fechas de tus tarjetas.</p>
          <div className="mt-6 space-y-3">
            {option('Todo lo visto', 'Parte por lo que estás más cerca de olvidar.', pools.all)}
            {option(
              'Solo lo marcado y lo difícil',
              'Las que marcaste para revisar y las que has fallado varias veces.',
              pools.hard,
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A card of the round: the same frame and buttons as studying, with their keys. */
export function ReviewScreen({
  round,
  current,
  onChange,
  onAnswer,
}: {
  round: Round;
  current: CardRef;
  onChange: (next: Round) => void;
  /** An answer of this round (of the deck of the card): practice. */
  onAnswer: (deckId: string) => void;
}) {
  const night = useDarkMode();
  const { api } = useServices();
  const client = useQueryClient();
  const material = useCardMaterial(current.deckId);
  const { revealed } = round;

  // The next cards are fetched ahead, so there is no wait between cards.
  useEffect(() => {
    for (const c of round.queue.slice(1, 4)) {
      void client.prefetchQuery(cardQuery(api, c.noteGuid, c.ord));
    }
  }, [api, client, round.queue]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const origin = (e.composedPath()[0] ?? e.target) as Element | null;
    if (
      origin instanceof Element &&
      origin.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')
    ) {
      return;
    }
    const activates = origin instanceof Element && origin.matches('button, a[href], summary');
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const reveals = (e.key === ' ' || e.key === 'Enter') && !activates;
    if (e.repeat) {
      if (reveals) e.preventDefault();
      return;
    }
    if (reveals) {
      e.preventDefault();
      if (revealed) onAnswer(current.deckId);
      onChange(revealed ? answerRound(round, 'good') : revealCard(round));
    } else if (revealed && (e.key === '1' || e.key === '2')) {
      e.preventDefault();
      onAnswer(current.deckId);
      onChange(answerRound(round, e.key === '1' ? 'again' : 'good'));
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const again = RATINGS.find((r) => r.rating === 1)!;
  const good = RATINGS.find((r) => r.rating === 3)!;
  const answer = (which: 'again' | 'good', info: typeof again) => (
    <button
      type="button"
      onClick={(e) => {
        onAnswer(current.deckId);
        onChange(answerRound(round, which));
        e.currentTarget.blur();
      }}
      className={`${button.base} ${button.secondary} h-[4.125rem] px-1 py-2`}
    >
      <span className={`font-semibold ${info.className}`}>{info.label}</span>
    </button>
  );
  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <StudyCard
          entry={current}
          revealed={revealed}
          night={night}
          onMissing={() => onChange(dropCurrent(round))}
        />
      </div>
      <div className="py-3" aria-label="Responder" role="group">
        {revealed ? (
          <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
            {answer('again', again)}
            {answer('good', good)}
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl">
            <button
              type="button"
              onClick={(e) => {
                onChange(revealCard(round));
                e.currentTarget.blur();
              }}
              className={`${button.base} ${button.primary} h-[4.125rem] w-full py-3 text-base`}
            >
              Mostrar respuesta
            </button>
          </div>
        )}
        <div className="mt-2 flex h-5 justify-center gap-4 text-xs text-muted">
          {revealed && material ? (
            <>
              <MaterialLink href={material.notePath}>
                <BookOpen className="size-3.5" aria-hidden="true" /> Ver apunte
              </MaterialLink>
              {material.quizPath ? (
                <MaterialLink href={material.quizPath}>
                  <ListChecks className="size-3.5" aria-hidden="true" /> Preguntas
                </MaterialLink>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * «Más»: marking a card (the only thing here that saves something) and reporting an error. `markable` false: only
 * reporting («Practicar estas» of the cards page writes nothing of the cards).
 */
export function ReviewMenu({
  current,
  flag,
  onMarked,
  markable = true,
}: {
  current: CardRef;
  flag: number;
  onMarked: (key: string, flag: number) => void;
  markable?: boolean;
}) {
  const { study } = useServices();
  const [reporting, setReporting] = useState<CardKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(id);
  }, [message]);
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2';
  const toggle = () => {
    const next = flag ? 0 : REVIEW_FLAG;
    const key = cardKey(current);
    onMarked(key, next);
    void study.setFlag(current, next).catch(() => {
      onMarked(key, flag);
      setMessage('No se pudo guardar la marca.');
    });
  };
  return (
    <>
      {/* Its place stays: marking does not move the title. */}
      {flag ? (
        <Flag
          className="size-5 flex-none text-brand"
          style={{ fill: 'currentColor' }}
          aria-label="Marcada para revisar"
        />
      ) : (
        <span className="size-5 flex-none" aria-hidden="true" />
      )}
      <Menu.Root>
        <Menu.Trigger className={`${button.base} ${button.ghost}`} aria-label="Más">
          <MoreHorizontal className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Más</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {markable ? (
              <Menu.Item className={item} onSelect={toggle}>
                <Flag className="size-4 text-muted" aria-hidden="true" />
                {flag ? 'Quitar la marca' : 'Marcar para revisar'}
              </Menu.Item>
            ) : null}
            <Menu.Item className={item} onSelect={() => setReporting(current)}>
              <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar
              error
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
      >
        {message ? (
          <p className="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">{message}</p>
        ) : null}
      </div>
      {reporting ? (
        <ReportEntry
          entry={reporting}
          onClose={() => setReporting(null)}
          onSent={() => {
            setReporting(null);
            setMessage('Gracias: tu reporte le llegó al autor.');
          }}
        />
      ) : null}
    </>
  );
}

export function RoundDone({
  round,
  deckPath,
  label,
  onAgain,
  title = 'Terminaste el repaso',
  againLabel = 'Otro repaso',
}: {
  round: Round;
  deckPath: string;
  label: string;
  onAgain: () => void;
  title?: string;
  againLabel?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">{title}</h1>
      <p className="mt-4 text-sm text-muted">
        {round.total.toLocaleString('es-CL')} {round.total === 1 ? 'tarjeta' : 'tarjetas'}
        {round.again > 0
          ? ` · «Otra vez» ${round.again} ${round.again === 1 ? 'vez' : 'veces'}`
          : ''}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={deckPath} className={`${button.base} ${button.primary}`}>
          Volver a {label}
        </Link>
        <button type="button" onClick={onAgain} className={`${button.base} ${button.secondary}`}>
          {againLabel}
        </button>
      </div>
    </div>
  );
}
