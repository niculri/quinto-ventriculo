// The keys of a round of review or practice: space or Enter shows the answer and then answers «Bien»; 1 is
// «Otra vez» and 2 is «Bien».
import { useEffect, useEffectEvent } from 'react';
import { answerRound, revealCard } from '@qv/study';
import type { Round } from '@qv/study';
import type { CardRef } from '../../progress/api/repository';
import { keyOrigin, pressesControl, typedInto } from './keyOrigin';

export function useReviewShortcuts(
  round: Round,
  current: CardRef,
  onChange: (next: Round) => void,
  onAnswer: (deckId: string) => void,
) {
  const { revealed } = round;
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const origin = keyOrigin(e);
    if (typedInto(origin)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const reveals = (e.key === ' ' || e.key === 'Enter') && !pressesControl(origin);
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
}
