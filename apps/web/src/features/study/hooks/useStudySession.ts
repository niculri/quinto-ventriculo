// A deck's study session on screen: the reducer's state, the actions the screen can take, and what runs around it
// (saving what the reducer asks for, the clock, the toast's timer and the browser's «leave?» while it saves).
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Rating } from '@qv/srs';
import { commandsNotIn, createStudyState, studyReducer } from '@qv/study';
import type { CommandId, HideAction, StudyAction, StudyData } from '@qv/study';
import { useApi } from '../../../shared/hooks/useApi';
import { useStudyRepository } from '../../progress/api/context';
import { studyKeys } from '../../progress/queries';
import { cardQuery } from '../../decks/api/queries';
import { SaveQueue } from '../api/SaveQueue';

const RETRY_DELAYS_MS = [1000, 3000];
const TOAST_MS = 3000;
const LOOK_FOR_MORE_MS = 15_000;

/** What the screen can do to the session; each action carries the moment it happens. */
export interface StudyActions {
  open: () => void;
  tick: () => void;
  reveal: () => void;
  answer: (rating: Rating) => void;
  hide: (action: HideAction) => void;
  flag: (value: number) => void;
  undo: () => void;
  skipMissing: (card: { noteGuid: string; ord: number }) => void;
}

function actionsOf(dispatch: (action: StudyAction) => void): StudyActions {
  return {
    open: () => dispatch({ type: 'opened', now: Date.now() }),
    tick: () => dispatch({ type: 'tick', now: Date.now() }),
    reveal: () => dispatch({ type: 'reveal' }),
    answer: (rating) => dispatch({ type: 'answer', rating, now: Date.now() }),
    hide: (action) => dispatch({ type: 'hide', action, now: Date.now() }),
    flag: (value) => dispatch({ type: 'flag', value }),
    undo: () => dispatch({ type: 'undo', now: Date.now() }),
    skipMissing: ({ noteGuid, ord }) =>
      dispatch({ type: 'skipMissing', card: { noteGuid, ord }, now: Date.now() }),
  };
}

export function useStudySession(initial: StudyData, rootId: string) {
  const study = useStudyRepository();
  const api = useApi();
  const client = useQueryClient();
  const [state, dispatch] = useReducer(studyReducer, undefined, () =>
    createStudyState(initial, rootId, Date.now()),
  );
  // Every action gets its number here, outside the reducer: React may run the reducer again for an action it set
  // aside under a more urgent one, and the commands it asks for must have the same ids then.
  const dispatchCountRef = useRef(0);
  const [numbered] = useState(
    () => (action: StudyAction) => dispatch({ ...action, dispatch: ++dispatchCountRef.current }),
  );
  const [act] = useState(() => actionsOf(numbered));
  const [saves] = useState(
    () =>
      new SaveQueue(
        study,
        new Map([...initial.rows].map(([k, r]) => [k, r.updatedAt])),
        RETRY_DELAYS_MS,
        (failure) => numbered({ type: 'saveFailed', failure }),
        (entries) => {
          for (const e of entries) {
            void client.query(cardQuery(api, e.noteGuid, e.ord)).catch(() => undefined);
          }
        },
      ),
  );
  const saving = useSyncExternalStore(saves.subscribe, () => saves.pending > 0);

  // Each command goes to the save queue once, by its id, whatever the number of times this runs or the state is
  // drawn again with the same action replayed.
  const takenRef = useRef(new Set<CommandId>());
  useEffect(() => {
    for (const command of commandsNotIn(state, takenRef.current)) {
      takenRef.current.add(command.id);
      saves.handle(command);
    }
  }, [state, saves]);

  const toastId = state.toast?.id;
  useEffect(() => {
    if (toastId === undefined) return;
    const timer = setTimeout(() => numbered({ type: 'toastExpired', id: toastId }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toastId, numbered]);

  // Reloading or closing while an answer is still being saved (or retried) would lose it: the browser asks.
  useEffect(() => {
    if (!saving) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [saving]);

  return { state, act, saves };
}

// The first card, a look for more every 15 s while nothing is left, and the deck's figures read again once everything
// is saved.
export function useSessionLifecycle(act: StudyActions, saves: SaveQueue) {
  const client = useQueryClient();
  useEffect(() => {
    act.open();
    const id = setInterval(act.tick, LOOK_FOR_MORE_MS);
    return () => {
      clearInterval(id);
      void saves.saved().then(() => client.invalidateQueries({ queryKey: studyKeys.all }));
    };
  }, [client, act, saves]);
}

// Whether «Listo por hoy» shows today's summary, decided once when it opens: crossing the rollover hour empties the
// day's answers, and the block must not go away then.
export function useDoneSummary(done: boolean, answeredToday: () => boolean): boolean {
  const [doneWithSummary, setDoneWithSummary] = useState<boolean | null>(null);
  if (!done && doneWithSummary !== null) setDoneWithSummary(null);
  const withSummary = done && (doneWithSummary ?? answeredToday());
  if (done && doneWithSummary === null) setDoneWithSummary(withSummary);
  return withSummary;
}

// Each card shown counts once (an undone one again): what the screen reader hears changes with every card.
export function useCardTurn(shownKey: string): number {
  const [turn, setTurn] = useState({ key: '', n: 0 });
  if (shownKey && shownKey !== turn.key) setTurn({ key: shownKey, n: turn.n + 1 });
  return turn.n;
}
