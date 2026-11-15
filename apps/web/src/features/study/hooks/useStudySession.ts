// A deck's study session on screen: the session (made once, from what the database said when it opened), its
// version for useSyncExternalStore, and its life while the screen is open.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { StudyData } from '@qv/study';
import { useApi } from '../../../shared/hooks/useApi';
import { useStudyRepository } from '../../progress/api/context';
import { studyKeys } from '../../progress/queries';
import { cardQuery } from '../../decks/queries';
import { StudySession } from '../api/StudySession';

export function useStudySession(initial: StudyData, rootId: string) {
  const study = useStudyRepository();
  const api = useApi();
  const client = useQueryClient();
  const [session] = useState(
    () =>
      new StudySession(initial, rootId, study, (entries) => {
        for (const e of entries) void client.prefetchQuery(cardQuery(api, e.noteGuid, e.ord));
      }),
  );
  const version = useSyncExternalStore(session.subscribe, session.getVersion);
  return { session, version };
}

// The first card, a look for more every 15 s while nothing is left, and the deck's figures read again once everything
// is saved; reloading or closing while an answer is still being saved (or retried) would lose it: the browser asks.
export function useSessionLifecycle(session: StudySession) {
  const client = useQueryClient();
  useEffect(() => {
    session.showNext();
    const id = setInterval(() => session.tick(), 15_000);
    return () => {
      clearInterval(id);
      void session.saved().then(() => client.invalidateQueries({ queryKey: studyKeys.all }));
    };
  }, [client, session]);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (session.pending > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [session]);
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
