// A round of «Practicar estas»: the final review's screen over the cards, counted as practice, and its end.

import { useEffect, useState } from 'react';
import { BackButton } from '../../../shared/ui/BackButton';
import { answerBar } from '../../../shared/ui/styles';
import { usePracticeRecorder } from '../../stats/practice';
import { ReviewMenu, ReviewScreen, RoundDone } from '../../study';
import { startRound } from '@qv/study';
import type { Round } from '@qv/study';
import type { CardRef } from '../../progress/api/repository';
import { cardsStrings } from '../strings';

export function PracticeRound({ cards, back }: { cards: CardRef[]; back: string }) {
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
        <BackButton to={back} label={cardsStrings.practice.back} className="justify-self-start" />
        <p className="min-w-0 truncate text-center text-sm font-medium tabular-nums sm:text-base">
          {current ? (
            <>
              <span className="sm:hidden">{cardsStrings.practice.left(round.queue.length)}</span>
              <span className="hidden sm:inline">
                {cardsStrings.practice.leftLong(round.queue.length)}
              </span>
            </>
          ) : (
            cardsStrings.practice.title
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
          <p className="sr-only">{cardsStrings.practice.noDates}</p>
          <ReviewScreen round={round} current={current} onChange={setRound} onAnswer={add} />
        </>
      ) : (
        <RoundDone
          round={round}
          deckPath={back}
          label={cardsStrings.practice.doneLabel}
          title={cardsStrings.practice.doneTitle}
          againLabel={cardsStrings.practice.again}
          onAgain={() => setRound(startRound(cards))}
        />
      )}
    </>
  );
}
