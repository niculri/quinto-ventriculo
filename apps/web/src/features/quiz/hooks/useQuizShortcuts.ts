// The keys of a question on screen (`model/keys.ts`), on the window, while no popup is open and not inside a field.
import { useEffect } from 'react';
import type { Round } from '@qv/quiz';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { keyAction } from '../model/keys';
import type { QuizKeyAction } from '../model/keys';
import type { QuestionEntry } from '../model/entries';
import type { RoundActions } from './roundActions';

export function useQuizShortcuts(o: {
  zoom: OpenImage | null;
  confirming: boolean;
  reporting: QuestionEntry | null;
  screen: Round['screen'];
  round: Round | null;
  current: QuestionEntry | null | undefined;
  revealed: boolean;
  reveal: () => void;
  actions: RoundActions;
}) {
  const { zoom, confirming, reporting, screen, round, current, revealed, reveal, actions } = o;
  useEffect(() => {
    const run = (a: QuizKeyAction) => {
      if (a.kind === 'skip') actions.skip();
      else if (a.kind === 'next') actions.next();
      else if (a.kind === 'reveal') reveal();
      else if (a.kind === 'answer') actions.answer(a.original);
      else if (a.kind === 'selfAssess') actions.selfAssess(a.knewIt);
    };
    const onKey = (e: KeyboardEvent) => {
      if (zoom || confirming || reporting || screen !== 'question' || !round || !current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
      const a = keyAction(
        { key: e.key, onButton: e.target instanceof HTMLButtonElement },
        { round, question: current.question, revealed },
      );
      if (!a) return;
      run(a);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, confirming, current, reporting, reveal, revealed, round, screen, zoom]);
}
