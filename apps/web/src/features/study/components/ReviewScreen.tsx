// A card of a final review's round and its two answers, which change no date.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { button } from '../../../shared/ui/styles';
import { useDarkMode } from '../../../shared/hooks/useDarkMode';
import { cardQuery } from '../../decks/queries';
import { answerRound, dropCurrent, revealCard } from '@qv/study';
import type { Round } from '@qv/study';
import { useCardMaterial } from '../hooks/useCardMaterial';
import { useReviewShortcuts } from '../hooks/useReviewShortcuts';
import type { CardRef } from '../../progress/api/repository';
import { RATINGS } from './ratings';
import { StudyCard } from './StudyCard';
import { MaterialRow } from './MaterialRow';
import { studyStrings } from '../strings';

export function ReviewScreen({
  round,
  current,
  onChange,
  onAnswer,
}: {
  round: Round;
  current: CardRef;
  onChange: (next: Round) => void;
  onAnswer: (deckId: string) => void;
}) {
  const night = useDarkMode();
  const api = useApi();
  const client = useQueryClient();
  const material = useCardMaterial(current.deckId);
  const { revealed } = round;

  useEffect(() => {
    for (const c of round.queue.slice(1, 4)) {
      void client.prefetchQuery(cardQuery(api, c.noteGuid, c.ord));
    }
  }, [api, client, round.queue]);

  useReviewShortcuts(round, current, onChange, onAnswer);

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
      <div className="py-3" aria-label={studyStrings.answer} role="group">
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
              {studyStrings.showAnswer}
            </button>
          </div>
        )}
        <MaterialRow material={material} revealed={revealed} />
      </div>
    </>
  );
}
