// The study screen of a deck: the session's card and its answers, the menus, the keyboard and the end screens.
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Undo2, X } from 'lucide-react';
import type { QueueEntry, Rating } from '@qv/srs';
import { paths } from '../../../shared/lib/paths';
import { useApi } from '../../../shared/hooks/useApi';
import { useStudyRepository } from '../../progress/api/context';
import { Notice } from '../../../shared/ui/Notice';
import { BackButton } from '../../../shared/ui/BackButton';
import { answerBar, button, studyScreen, tapArea } from '../../../shared/ui/styles';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { cardQuery } from '../../decks/queries';
import { deckTitle } from '../../catalog/model/tree';
import { descendants, studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import {
  cardKey,
  estimateMinutes,
  FLAGS,
  HEAVY_LOAD_MINUTES,
  minutesText,
  totalCards,
} from '@qv/study';
import type { HideAction, StudyData } from '@qv/study';
import { CountNumbers, DayLoad } from '../../progress/DeckCounts';
import { DaySummary } from './DaySummary';
import { useCardMaterial } from '../hooks/useCardMaterial';
import { MaterialRow } from './MaterialRow';
import { studyKeys } from '../../progress/queries';
import { StudySession } from '../api/StudySession';
import { keys } from '../../../shared/ui/keys';
import { useTip } from '../../tips/useTip';
import { LiveToast } from '../../../shared/ui/Toast';
import { useTitle } from '../../../shared/hooks/useTitle';
import { Congrats } from './Congrats';
import { DoneToday } from './DoneToday';
import { MoreMenu } from './MoreMenu';
import { RATINGS } from './ratings';
import { ReportEntry } from './ReportEntry';
import { SimpleMenu } from './SimpleMenu';
import { StudyCard } from './StudyCard';
import { Welcome } from './Welcome';

const HIDE_KEYS: Record<string, HideAction> = {
  '-': 'bury_card',
  '=': 'bury_note',
  '@': 'suspend_card',
  '!': 'suspend_note',
};

const SIMPLE_HIDE_KEYS: Record<string, HideAction> = { '-': 'bury_note', '@': 'suspend_card' };

/** «Marcar para revisar» is one flag; a card flagged otherwise in the full mode also counts as marked. */
const REVIEW_FLAG = 1;

export function Reviewer({
  node,
  rootId,
  initial,
}: {
  node: CourseDeckNode;
  rootId: string;
  initial: StudyData;
}) {
  const study = useStudyRepository();
  const api = useApi();
  const client = useQueryClient();
  const night = useDarkMode();
  const [session] = useState(
    () =>
      new StudySession(initial, rootId, study, (entries) => {
        for (const e of entries) void client.prefetchQuery(cardQuery(api, e.noteGuid, e.ord));
      }),
  );
  const version = useSyncExternalStore(session.subscribe, session.getVersion);

  const rootName = deckTitle(node);
  const [scopeDecks] = useState(() => new Set(descendants(node).map((n) => n.id)));
  const deckPath = paths.deck(node.ref);
  const { shown, revealed, toast, failure } = session;
  const full = initial.prefs.fullAnki;
  const fourButtons = initial.prefs.fourButtons;
  const material = useCardMaterial(shown?.entry.deckId);
  const tip = useTip(
    'tip-material',
    !full && revealed && !!material && session.answeredInSession > 0,
  );
  const [opening] = useState(() => session.counts());
  const openingMinutes = estimateMinutes(opening, initial.plan.medianAnswerMs);
  const [heavy, setHeavy] = useState(!full && openingMinutes >= HEAVY_LOAD_MINUTES);
  const [reporting, setReporting] = useState<QueueEntry | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(false), 3000);
    return () => clearTimeout(id);
  }, [sent]);
  const message = toast ?? (sent ? 'Gracias: tu reporte le llegó al autor.' : null);

  useTitle(`Estudiar ${rootName}`);

  useEffect(() => {
    session.showNext();
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
  // The summary keeps its place only if today has answers in what is studied, decided once when the screen opens:
  // crossing the rollover hour empties the day's answers, and the block must not go away then.
  const done = !shown && version > 0;
  const [doneWithSummary, setDoneWithSummary] = useState<boolean | null>(null);
  if (!done && doneWithSummary !== null) setDoneWithSummary(null);
  const withSummary = done && (doneWithSummary ?? session.answeredToday(scopeDecks));
  if (done && doneWithSummary === null) setDoneWithSummary(withSummary);
  const summary = withSummary ? (
    <DaySummary node={node} prefs={initial.prefs} saved={() => session.saved()} />
  ) : null;
  // Each card shown counts once (an undone one again): what the screen reader hears changes with every card.
  const shownKey = shown ? cardKey(shown.entry) : '';
  const [turn, setTurn] = useState({ key: '', n: 0 });
  if (shownKey && shownKey !== turn.key) setTurn({ key: shownKey, n: turn.n + 1 });
  const currentFlag = shown ? (session.row(shown.entry)?.flag ?? 0) : 0;
  const flagInfo = FLAGS.find((f) => f.flag === currentFlag);

  return (
    <div className={studyScreen}>
      <div className={`${answerBar} pb-2`}>
        <BackButton to={deckPath} label={studyBackLabel(node)} className="justify-self-start" />
        <div className="flex min-w-0 justify-center" aria-label="Tarjetas que quedan" role="group">
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
        <div className="flex min-w-0 items-center justify-end gap-2">
          {flagInfo && full ? (
            <Flag
              className="size-5"
              style={{ color: flagInfo.color, fill: flagInfo.color }}
              role="img"
              aria-label={`Marcador ${flagInfo.label.toLowerCase()}`}
            />
          ) : currentFlag && !full ? (
            <Flag
              className="size-5 flex-none text-brand"
              style={{ fill: 'currentColor' }}
              role="img"
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
            {!full ? (
              <MaterialRow material={material} revealed={revealed}>
                {tip.shown ? (
                  // In the line's own room: it moves nothing, and closed it does not come back. Closed, its room
                  // stays until the visit ends, so that «Ver apunte» and «Preguntas» do not move.
                  <span
                    aria-hidden={tip.show ? undefined : true}
                    className={`flex min-w-0 items-center gap-1 text-xs whitespace-nowrap text-ink ${tip.show ? '' : 'invisible'}`}
                  >
                    <span className="truncate">lleva al apunte del que sale esta tarjeta</span>
                    <button
                      type="button"
                      onClick={tip.close}
                      aria-label="Cerrar el consejo"
                      className={`flex-none rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink ${tapArea}`}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
              </MaterialRow>
            ) : null}
          </div>
        </>
      ) : !done ? (
        // Before the session looks for its first card: neither the end screen nor its summary, which would be gone
        // in the next frame.
        <div className="flex-1" />
      ) : full ? (
        <Congrats info={session.congrats()} deckPath={deckPath} summary={summary} />
      ) : (
        <DoneToday
          info={session.congrats()}
          node={node}
          deckPath={deckPath}
          hasSeen={(id) => session.hasSeen(id)}
          summary={summary}
        />
      )}

      <p role="status" className="sr-only">
        {shown
          ? `${revealed ? 'Respuesta de la tarjeta' : 'Tarjeta'} ${turn.n} de esta sesión`
          : ''}
      </p>
      <LiveToast message={message} />

      {!full && !initial.prefs.welcomeSeen && shown ? <Welcome prefs={initial.prefs} /> : null}

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
