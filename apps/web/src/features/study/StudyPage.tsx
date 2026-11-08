import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  Flag,
  ListChecks,
  MessageSquareWarning,
  EyeOff,
  MoreHorizontal,
  PartyPopper,
  SkipForward,
  Undo2,
} from 'lucide-react';
import type { QueueEntry, Rating } from '@qv/srs';
import type { DeckDetail } from '@qv/schema';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry, Notice } from '../../ui/Notice';
import { button } from '../../ui/styles';
import { CardFrame, useDarkMode } from '../decks/CardFrame';
import { cardQuery, useCard, useDeck } from '../decks/queries';
import { deckTitle } from '../anki/DeckPage';
import { ancestry, descendants, hasPage } from '../anki/tree';
import type { CourseDeckNode } from '../anki/tree';
import type { CardKey, StudyPreferences } from './repository';
import { ApiRequestError } from '../../lib/api';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { CountNumbers, DayLoad } from './DeckCounts';
import { useCardMaterial } from './material';
import { studyKeys, useSavePreferences, useStudyData } from './queries';
import { catchUpText } from './pace';
import { cardKey } from './scheduler';
import type { StudyData } from './scheduler';
import { StudySession } from './session';
import { HEAVY_LOAD_MINUTES, estimateMinutes, minutesText, totalCards } from './simple';
import { FLAGS } from './flags';

export { FLAGS };
import type { CongratsInfo, HideAction } from './session';
import { keys } from '../../ui/keys';
import { ReportCardDialog } from '../admin/ReportCardDialog';

/** Studying a deck of the tree: it and everything below it, with the limits of each level (as Anki). */
export function StudyPage({ node }: { node: CourseDeckNode }) {
  const deck = useDeck(node.id);
  if (deck.isError) {
    if (deck.error instanceof ApiRequestError && [400, 404].includes(deck.error.status)) {
      return <NotFoundPage />;
    }
    return <ErrorWithRetry error={deck.error} onRetry={() => void deck.refetch()} />;
  }
  if (!deck.data) return <Loading text="Preparando el mazo…" />;
  return <StudyLoader node={node} deck={deck.data} rootId={node.id} />;
}

function StudyLoader({
  node,
  deck,
  rootId,
}: {
  node: CourseDeckNode;
  deck: DeckDetail;
  rootId: string;
}) {
  const study = useStudyData(deck);
  // The session starts from what the database said when it was opened; afterwards it keeps its own state.
  const [initial, setInitial] = useState<StudyData | null>(null);
  if (!initial && study.data) setInitial(study.data);
  if (study.error && !initial) return <ErrorWithRetry error={study.error} onRetry={study.retry} />;
  if (!initial) return <Loading text="Preparando tus tarjetas…" />;
  return <Reviewer node={node} rootId={rootId} initial={initial} />;
}

/** The buttons, as Anki's (with its Spanish texts). */
export const RATINGS: { rating: Rating; label: string; className: string }[] = [
  { rating: 1, label: 'Otra vez', className: 'text-[#c62828] dark:text-[#ff8a80]' },
  { rating: 2, label: 'Difícil', className: 'text-muted' },
  { rating: 3, label: 'Bien', className: 'text-[#2e7d32] dark:text-[#85d08a]' },
  { rating: 4, label: 'Fácil', className: 'text-state-new' },
];

/** Anki's keys to bury and suspend. */
const HIDE_KEYS: Record<string, HideAction> = {
  '-': 'bury_card',
  '=': 'bury_note',
  '@': 'suspend_card',
  '!': 'suspend_note',
};

/** The two of simple mode: «Saltar por hoy» (the whole note) and «No mostrar más» (the card). */
const SIMPLE_HIDE_KEYS: Record<string, HideAction> = { '-': 'bury_note', '@': 'suspend_card' };
/** «Marcar para revisar» is one flag; a card flagged otherwise in the full mode also counts as marked. */
const REVIEW_FLAG = 1;

/** The study screen: the card, «Mostrar respuesta» and the four buttons, the counts and Anki's shortcuts. */
function Reviewer({
  node,
  rootId,
  initial,
}: {
  node: CourseDeckNode;
  rootId: string;
  initial: StudyData;
}) {
  const { study, api } = useServices();
  const client = useQueryClient();
  const night = useDarkMode();
  const [session] = useState(
    () =>
      new StudySession(initial, rootId, study, (entries) => {
        for (const e of entries) void client.prefetchQuery(cardQuery(api, e.noteGuid, e.ord));
      }),
  );
  useSyncExternalStore(session.subscribe, session.getVersion);

  const rootName = deckTitle(node);
  const deckPath = paths.deck(node.ref);
  const { shown, revealed, toast, failure } = session;
  const full = initial.prefs.fullAnki;
  const fourButtons = initial.prefs.fourButtons;
  const material = useCardMaterial(shown?.entry.deckId);
  // How much is left when the session opens: from a certain load on, it warns once and offers to stop.
  const [opening] = useState(() => session.counts());
  const openingMinutes = estimateMinutes(opening, initial.plan.medianAnswerMs);
  const [heavy, setHeavy] = useState(!full && openingMinutes >= HEAVY_LOAD_MINUTES);
  // «Reportar error»: the card being reported, and the thanks for a moment after sending.
  const [reporting, setReporting] = useState<QueueEntry | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(false), 3000);
    return () => clearTimeout(id);
  }, [sent]);
  const message = toast ?? (sent ? 'Gracias: tu reporte le llegó al autor.' : null);

  useEffect(() => {
    document.title = `Estudiar ${rootName} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [rootName]);

  useEffect(() => {
    session.showNext();
    // While there is nothing to show, check again from time to time: a learning card may come due.
    const id = setInterval(() => session.tick(), 15_000);
    return () => {
      clearInterval(id);
      // What the deck page shows has to be read again once everything is saved.
      void session.saved().then(() => client.invalidateQueries({ queryKey: studyKeys.all }));
    };
  }, [client, session]);

  // Reloading or closing while an answer is still being saved (or retried) would lose it: the browser asks.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (session.pending > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [session]);

  // Simple mode: «Mostrar respuesta» as high as the buttons that replace it, so the card does not change size.
  const barHeight = full ? '' : 'h-[4.125rem]';
  const hideKeys = full ? HIDE_KEYS : SIMPLE_HIDE_KEYS;
  // Anki's shortcuts; with two buttons, 1 is «Otra vez» and 2 is «Bien».
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const origin = (e.composedPath()[0] ?? e.target) as Element | null;
    if (
      origin instanceof Element &&
      origin.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')
    ) {
      return;
    }
    const activates = origin instanceof Element && origin.matches('button, a[href], summary');
    const mod = e.ctrlKey || e.metaKey;
    const reveals = (e.key === ' ' || e.key === 'Enter') && !activates && !mod && !e.altKey;
    // A key held down repeats: it must not answer, bury or undo card after card.
    if (e.repeat) {
      if (reveals) e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      session.undo();
    } else if (mod && /^[1-7]$/.test(e.key) && full) {
      e.preventDefault();
      session.flag(Number(e.key));
    } else if (Object.hasOwn(hideKeys, e.key) && !e.metaKey && (!e.ctrlKey || e.altKey)) {
      // By the character: on Spanish keyboards «@» is Alt+2 (Mac) or AltGr (Ctrl+Alt on Windows). Ctrl
      // alone is left to the browser (Ctrl+- and Ctrl+= are its zoom).
      session.hide(hideKeys[e.key]!);
    } else if (mod || e.altKey) {
      return;
    } else if (reveals) {
      e.preventDefault();
      if (!session.revealed) session.reveal();
      else session.answer(3);
    } else if (fourButtons && /^[1-4]$/.test(e.key) && session.revealed) {
      e.preventDefault();
      session.answer(Number(e.key) as Rating);
    } else if (!fourButtons && /^[12]$/.test(e.key) && session.revealed) {
      e.preventDefault();
      session.answer(e.key === '1' ? 1 : 3);
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const counts = session.counts();
  const currentFlag = shown ? (session.row(shown.entry)?.flag ?? 0) : 0;
  const flagInfo = FLAGS.find((f) => f.flag === currentFlag);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-1px)] max-w-5xl flex-col px-2 pt-2 sm:px-4 sm:pt-3">
      <div className="flex items-center gap-2 pb-2">
        <Link
          to={deckPath}
          className={`${button.base} ${button.ghost}`}
          aria-label={`Volver a ${rootName}`}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="hidden max-w-[16rem] truncate sm:inline">{rootName}</span>
        </Link>
        <div
          className="flex min-w-0 flex-1 justify-center"
          aria-label="Tarjetas que quedan"
          role="group"
        >
          {full ? (
            <CountNumbers
              counts={counts}
              current={shown?.entry.kind ?? null}
              className="inline-flex text-lg"
            />
          ) : (
            <DayLoad
              counts={counts}
              medianAnswerMs={initial.plan.medianAnswerMs}
              empty=""
              className="truncate text-sm font-medium sm:text-base"
            />
          )}
        </div>
        {flagInfo && full ? (
          <Flag
            className="size-5"
            style={{ color: flagInfo.color, fill: flagInfo.color }}
            aria-label={`Marcador ${flagInfo.label.toLowerCase()}`}
          />
        ) : currentFlag && !full ? (
          <Flag
            className="size-5 flex-none text-brand"
            style={{ fill: 'currentColor' }}
            aria-label="Marcada para revisar"
          />
        ) : full ? null : (
          // Its place stays: marking does not move what is on top.
          <span className="size-5 flex-none" aria-hidden="true" />
        )}
        {full ? (
          <MoreMenu
            disabled={!shown}
            onBury={(a) => session.hide(a)}
            onFlag={(f) => session.flag(f)}
            onUndo={() => session.undo()}
            canUndo={session.canUndo}
            currentFlag={currentFlag}
            optionsPath={paths.deckOptions({ deck: node.id })}
            onReport={() => setReporting(shown?.entry ?? null)}
          />
        ) : (
          <>
            <button
              type="button"
              disabled={!session.canUndo}
              onClick={(e) => {
                session.undo();
                // Focus does not stay here: space and Enter have to keep showing the answer.
                e.currentTarget.blur();
              }}
              className={`${button.base} ${button.ghost}`}
              aria-label="Deshacer"
              title={`Deshacer (${keys('Ctrl+Z')})`}
            >
              <Undo2 className="size-5 sm:size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Deshacer</span>
            </button>
            <SimpleMenu
              disabled={!shown}
              marked={currentFlag !== 0}
              onHide={(a) => session.hide(a)}
              onMark={() => session.flag(currentFlag || REVIEW_FLAG)}
              onReport={() => setReporting(shown?.entry ?? null)}
            />
          </>
        )}
      </div>

      {heavy && shown ? (
        <div className="pb-2">
          <Notice
            title={`Hoy son ${totalCards(opening).toLocaleString('es-CL')} tarjetas, ${minutesText(openingMinutes)}`}
            tone="info"
          >
            <p>Puedes parar cuando quieras: lo que no alcances sale mañana.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHeavy(false)}
                className={`${button.base} ${button.secondary} py-1.5`}
              >
                Seguir
              </button>
              <Link to={deckPath} className={`${button.base} ${button.ghost} py-1.5`}>
                Parar por hoy
              </Link>
            </div>
          </Notice>
        </div>
      ) : null}

      {failure ? (
        <div className="pb-2">
          <Notice title="Se detuvo la sesión">
            <p>{failure}</p>
            <button
              type="button"
              className={`${button.base} ${button.secondary} mt-3`}
              onClick={() => window.location.reload()}
            >
              Volver a cargar
            </button>
          </Notice>
        </div>
      ) : null}

      {shown ? (
        <>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
            <StudyCard
              entry={shown.entry}
              revealed={revealed}
              night={night}
              onMissing={() => session.skipMissing(shown.entry)}
            />
          </div>
          <div className="py-3" aria-label="Responder" role="group">
            {revealed ? (
              <div
                className={`mx-auto grid gap-2 ${fourButtons ? 'max-w-2xl grid-cols-4' : 'max-w-md grid-cols-2'}`}
              >
                {RATINGS.filter((r) => fourButtons || r.rating === 1 || r.rating === 3).map(
                  ({ rating, label, className }) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => session.answer(rating)}
                      className={`${button.base} ${button.secondary} flex-col gap-0.5 px-1 py-2 ${barHeight}`}
                      aria-label={`${label} (${shown.labels[rating - 1]})`}
                      disabled={!!failure}
                    >
                      <span className="text-xs text-muted tabular-nums">
                        {shown.labels[rating - 1]}
                      </span>
                      <span className={`font-semibold ${className}`}>{label}</span>
                    </button>
                  ),
                )}
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl">
                <button
                  type="button"
                  onClick={() => session.reveal()}
                  className={`${button.base} ${button.primary} w-full py-3 text-base ${barHeight}`}
                >
                  Mostrar respuesta
                </button>
              </div>
            )}
            {/* Always its room, on every card of the session: the card and the buttons do not move. */}
            {!full ? (
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
            ) : null}
          </div>
        </>
      ) : full ? (
        <Congrats info={session.congrats()} deckPath={deckPath} />
      ) : (
        <DoneToday
          info={session.congrats()}
          node={node}
          deckPath={deckPath}
          hasSeen={(id) => session.hasSeen(id)}
        />
      )}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
      >
        {message ? (
          <p className="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">{message}</p>
        ) : null}
      </div>

      {!full && !initial.prefs.welcomeSeen ? <Welcome prefs={initial.prefs} /> : null}

      {reporting ? (
        <ReportEntry
          entry={reporting}
          onClose={() => setReporting(null)}
          onSent={() => {
            setReporting(null);
            setSent(true);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * «Ver apunte» and «Preguntas» open another tab, to keep the session. Focus does not stay on the link: back here,
 * Enter has to answer, not open it again.
 */
export function MaterialLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.currentTarget.blur()}
      className="inline-flex items-center gap-1 hover:text-ink hover:underline"
    >
      {children}
    </a>
  );
}

/** «Reportar error» of the card on screen, with its code. */
export function ReportEntry({
  entry,
  onClose,
  onSent,
}: {
  entry: CardKey;
  onClose: () => void;
  onSent: () => void;
}) {
  const card = useCard(entry.noteGuid, entry.ord);
  return (
    <ReportCardDialog
      card={{
        noteGuid: entry.noteGuid,
        ord: entry.ord,
        deckId: card.data?.deckId ?? null,
        code: card.data?.code ?? null,
        version: card.data?.version ?? null,
      }}
      onClose={onClose}
      onSent={onSent}
    />
  );
}

export function StudyCard({
  entry,
  revealed,
  night,
  onMissing,
}: {
  entry: CardKey;
  revealed: boolean;
  night: boolean;
  /** The card is no longer on the site (404): the session skips it instead of showing an error. */
  onMissing?: () => void;
}) {
  const card = useCard(entry.noteGuid, entry.ord);
  const missing = !!onMissing && card.error instanceof ApiRequestError && card.error.status === 404;
  const skip = useEffectEvent(() => onMissing?.());
  useEffect(() => {
    if (missing) skip();
  }, [missing, entry.noteGuid, entry.ord]);
  if (missing) return <Loading text="Cargando la tarjeta…" />;
  if (card.isError)
    return <ErrorWithRetry error={card.error} onRetry={() => void card.refetch()} />;
  if (!card.data) return <Loading text="Cargando la tarjeta…" />;
  return (
    <CardFrame
      key={`${cardKey(entry)}/${revealed ? 'a' : 'q'}`}
      html={revealed ? card.data.back : card.data.front}
      css={card.data.css}
      ord={card.data.ord}
      night={night}
      occlusion={card.data.kind === 'occlusion'}
      label={revealed ? 'Reverso de la tarjeta' : 'Frente de la tarjeta'}
    />
  );
}

/** «Más»: what the keyboard shortcuts do, for the phone. */
function MoreMenu({
  disabled,
  onBury,
  onFlag,
  onUndo,
  canUndo,
  currentFlag,
  optionsPath,
  onReport,
}: {
  disabled: boolean;
  onBury: (action: HideAction) => void;
  onFlag: (flag: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  currentFlag: number;
  optionsPath: string;
  onReport: () => void;
}) {
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';
  const shortcut = (k: string) => (
    <kbd className="ml-auto pl-4 font-sans text-xs text-muted">{keys(k)}</kbd>
  );
  return (
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
          // Focus does not go back to «Más»: space and Enter have to keep showing the answer.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Menu.Item className={item} disabled={disabled} onSelect={onReport}>
            <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar error
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} disabled={!canUndo} onSelect={onUndo}>
            <Undo2 className="size-4 text-muted" aria-hidden="true" /> Deshacer {shortcut('Ctrl+Z')}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('bury_card')}>
            Enterrar tarjeta {shortcut('-')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('bury_note')}>
            Enterrar nota {shortcut('=')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('suspend_card')}>
            Suspender tarjeta {shortcut('@')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('suspend_note')}>
            Suspender nota {shortcut('!')}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Sub>
            <Menu.SubTrigger className={item} disabled={disabled}>
              <Flag className="size-4 text-muted" aria-hidden="true" /> Marcar tarjeta
            </Menu.SubTrigger>
            <Menu.Portal>
              <Menu.SubContent
                sideOffset={4}
                className="z-50 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
              >
                {FLAGS.map((f) => (
                  <Menu.CheckboxItem
                    key={f.flag}
                    className={item}
                    checked={currentFlag === f.flag}
                    onSelect={() => onFlag(f.flag)}
                  >
                    <Flag
                      className="size-4"
                      style={{ color: f.color, fill: f.color }}
                      aria-hidden="true"
                    />
                    {f.label} {shortcut(`Ctrl+${f.flag}`)}
                  </Menu.CheckboxItem>
                ))}
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item asChild className={item}>
            <Link to={optionsPath}>Opciones</Link>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** «Más» of the simple mode: the few things one does with a card. */
function SimpleMenu({
  disabled,
  marked,
  onHide,
  onMark,
  onReport,
}: {
  disabled: boolean;
  marked: boolean;
  onHide: (action: HideAction) => void;
  onMark: () => void;
  onReport: () => void;
}) {
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';
  const shortcut = (k: string) => (
    <kbd className="ml-auto pl-4 font-sans text-xs text-muted">{keys(k)}</kbd>
  );
  return (
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
          <Menu.Item className={item} disabled={disabled} onSelect={() => onHide('bury_note')}>
            <SkipForward className="size-4 text-muted" aria-hidden="true" /> Saltar por hoy{' '}
            {shortcut('-')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onHide('suspend_card')}>
            <EyeOff className="size-4 text-muted" aria-hidden="true" /> No mostrar más{' '}
            {shortcut('@')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={onMark}>
            <Flag className="size-4 text-muted" aria-hidden="true" />
            {marked ? 'Quitar la marca' : 'Marcar para revisar'}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} disabled={disabled} onSelect={onReport}>
            <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar error
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The first time somebody enters to study: three steps, once. */
function Welcome({ prefs }: { prefs: StudyPreferences }) {
  const [open, setOpen] = useState(true);
  const save = useSavePreferences();
  const close = () => {
    setOpen(false);
    save.mutate({ ...prefs, welcomeSeen: true });
  };
  const step = (n: number, title: string, text: string) => (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 flex-none items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
      >
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
      </div>
    </li>
  );
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          // On a small phone the steps scroll, between the title and «Entendido», which is always in sight.
          className="fixed top-4 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 flex-col rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:top-[12vh] sm:max-h-[calc(88dvh-1rem)]"
          // Focus does not go to a button behind: space and Enter have to show the answer.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="font-serif text-xl font-semibold">
            Cómo se estudia aquí
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Tres pasos para empezar a estudiar con las tarjetas.
          </Dialog.Description>
          <ol className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
            {step(
              1,
              'Responde «Otra vez» o «Bien»',
              'Intenta acordarte y muestra la respuesta. «Otra vez» si no te la sabías: vuelve en unos minutos. «Bien» si te la sabías: vuelve más adelante, cada vez más separada.',
            )}
            {step(
              2,
              'Vuelve cada día',
              'Cada tarjeta sale cuando estás por olvidarla. Unos minutos diarios rinden más que una tarde completa antes de la prueba.',
            )}
            {step(
              3,
              'Activa lo que vas viendo',
              'Cada semana o clase parte desactivada. La activas en la página del ramo o del certamen, y sus tarjetas nuevas empiezan a salir.',
            )}
          </ol>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={close} className={`${button.base} ${button.primary}`}>
              Entendido
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Nothing left in simple mode: what to do now, never an empty screen. */
function DoneToday({
  info,
  node,
  deckPath,
  hasSeen,
}: {
  info: CongratsInfo;
  node: CourseDeckNode;
  deckPath: string;
  hasSeen: (assessmentId: string) => boolean;
}) {
  // Where the switches are: the course's page, or the deck's own page (the assessment's, or its lecture's).
  const choosePath = node.depth <= 2 ? paths.course(node.ref.course) : deckPath;
  const assessment = ancestry(node).find((n): n is CourseDeckNode => n.depth === 3 && hasPage(n));
  const tomorrow = info.dueTomorrow ? (
    <p>
      Mañana: {info.dueTomorrow} {info.dueTomorrow === 1 ? 'tarjeta' : 'tarjetas'} de repaso.
    </p>
  ) : null;
  if (info.extrasOff) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <BookOpen className="size-10 text-brand" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Las extras están apagadas</h1>
        <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
          <p>
            Son tarjetas con más detalle. Para estudiarlas, enciende «Incluir extras»
            {assessment ? ` en ${assessment.label}` : ''}.
          </p>
          {tomorrow}
        </div>
        <Link
          to={assessment ? paths.deck(assessment.ref) : deckPath}
          className={`${button.base} ${button.primary} mt-8`}
        >
          {assessment ? `Ir a ${assessment.label}` : 'Volver al mazo'}
        </Link>
      </div>
    );
  }
  if (info.nothingActive) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <BookOpen className="size-10 text-brand" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Todavía no activas esta materia</h1>
        <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
          <p>
            Cada semana o clase parte desactivada. Activa lo que estás viendo en clases y empezarán
            a salir sus tarjetas nuevas.
          </p>
          {info.learnMessage ? <p>{info.learnMessage}</p> : null}
          {tomorrow}
        </div>
        <Link to={choosePath} className={`${button.base} ${button.primary} mt-8`}>
          Elegir qué estudiar
        </Link>
      </div>
    );
  }
  // The assessment of this deck or, from a course, those that have something to review.
  const reviews = (
    node.depth <= 2
      ? descendants(node).filter((n): n is CourseDeckNode => n.depth === 3 && hasPage(n))
      : assessment
        ? [assessment]
        : []
  ).filter((a) => hasSeen(a.id));
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">Listo por hoy</h1>
      <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
        {info.learnMessage ? <p>{info.learnMessage}</p> : null}
        {info.exam?.roseTo ? (
          <p>Para llegar a la fecha, ahora son {info.exam.roseTo} al día.</p>
        ) : null}
        {info.exam?.catchUp ? <p>{catchUpText(info.exam.catchUp)}</p> : null}
        {info.newLimitReached && info.exam?.finalReview ? (
          <p>Estás en los días de repaso final: no salen tarjetas nuevas.</p>
        ) : (info.newLimitReached || info.buried) && info.exam?.lastNewDay ? (
          <p>Ya viste tus tarjetas nuevas de hoy. Mañana empieza el repaso final: no salen más.</p>
        ) : info.newLimitReached && info.exam?.computed ? (
          <p>Ya viste tus tarjetas nuevas de hoy. Mañana salen más.</p>
        ) : info.newLimitReached ? (
          <p>
            Ya viste tus tarjetas nuevas de hoy. Mañana salen más
            {assessment ? (
              <>
                , o puedes subir el número en{' '}
                <Link to={paths.deck(assessment.ref)} className="text-brand hover:underline">
                  {assessment.label}
                </Link>
              </>
            ) : null}
            .
          </p>
        ) : null}
        {/* Answering a card also keeps the others of its note for another day. */}
        {info.buried && !info.exam?.lastNewDay ? (
          <p>Las tarjetas que saltaste y las de la misma nota que una de hoy salen desde mañana.</p>
        ) : null}
        {tomorrow}
        {info.inactiveNew > 0 ? (
          <p>
            Hay más materia sin activar.{' '}
            <Link to={choosePath} className="text-brand hover:underline">
              Elegir qué estudiar
            </Link>
          </p>
        ) : null}
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={deckPath} className={`${button.base} ${button.primary}`}>
          Volver al mazo
        </Link>
        {reviews.map((a) => (
          <Link
            key={a.id}
            to={paths.deckReview(a.ref)}
            className={`${button.base} ${button.secondary}`}
          >
            {reviews.length > 1
              ? `Repasar ${a.label}, sin cambiar fechas`
              : 'Repasar igual, sin cambiar fechas'}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** «¡Felicitaciones! Has finalizado este mazo por ahora.» and when the next cards come (congrats.rs). */
function Congrats({ info, deckPath }: { info: CongratsInfo; deckPath: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">
        ¡Felicitaciones! Has finalizado este mazo por ahora.
      </h1>
      <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
        {info.learnMessage ? <p>{info.learnMessage}</p> : null}
        {info.reviewLimitReached ? (
          <p>
            Has alcanzado el límite actual de repasos, pero todavía hay tarjetas a la espera de ser
            repasadas. Para una memorización óptima, considera aumentar el límite diario en las
            opciones.
          </p>
        ) : null}
        {info.newLimitReached ? (
          <p>
            Hay más tarjetas nuevas disponibles, pero has alcanzado el límite diario. Puedes
            aumentar el límite en las opciones, pero ten en cuenta que cuantas más tarjetas nuevas
            introduzcas, más aumentará tu carga de trabajo a corto plazo.
          </p>
        ) : null}
        {info.buried ? <p>Una o más tarjetas fueron enterradas y se mostrarán mañana.</p> : null}
        <p>Programadas para mañana: {info.dueTomorrow}</p>
      </div>
      <Link to={deckPath} className={`${button.base} ${button.primary} mt-8`}>
        Volver al mazo
      </Link>
    </div>
  );
}
