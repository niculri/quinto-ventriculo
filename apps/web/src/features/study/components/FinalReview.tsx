// A final review once its data is read: choosing what to review, its round and its end.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { paths } from '../../../shared/lib/paths';
import { answerBar, studyScreen } from '../../../shared/ui/styles';
import { studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { BackButton } from '../../../shared/ui/BackButton';
import { cardKey, reviewPools, startRound } from '@qv/study';
import type { Round, StudyData } from '@qv/study';
import { studyKeys } from '../../progress/queries';
import type { CardRef } from '../../progress/api/repository';
import { usePracticeRecorder } from '../../stats/hooks/usePracticeRecorder';
import { ChooseReview } from './ChooseReview';
import { ReviewMenu } from './ReviewMenu';
import { ReviewScreen } from './ReviewScreen';
import { RoundDone } from './RoundDone';
import { sharedStrings } from '../../../shared/strings/shared.strings';
import { chooseReviewStrings } from './strings/ChooseReview.strings';
import { finalReviewStrings } from './strings/FinalReview.strings';

export function FinalReview({ node, data }: { node: CourseDeckNode; data: StudyData }) {
  const [round, setRound] = useState<Round | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Only to choose: a mark made in a round counts for the next one.
  const choosing = round === null;
  const pools = useMemo(
    () => (choosing ? reviewPools(data, marks) : { all: [], hard: [] }),
    [choosing, data, marks],
  );
  const deckPath = paths.deck(node.ref);
  const client = useQueryClient();
  const marked = useRef(false);
  const { add: addPractice, flush: flushPractice } = usePracticeRecorder();
  const finished = !!round && !round.queue[0];
  useEffect(() => {
    if (finished) flushPractice();
  }, [finished, flushPractice]);

  useEffect(() => {
    document.title = sharedStrings.pageTitle(chooseReviewStrings.review.title(node.label));
    return () => {
      document.title = sharedStrings.siteName;
      // Only a mark can have changed something.
      if (marked.current) void client.invalidateQueries({ queryKey: studyKeys.all });
    };
  }, [client, node.label]);

  const left = round ? round.queue.length : null;
  return (
    <div className={studyScreen}>
      <div className={`${answerBar} min-h-11 pb-2`}>
        <BackButton to={deckPath} label={studyBackLabel(node)} className="justify-self-start" />
        <p className="min-w-0 truncate text-center text-sm font-medium tabular-nums sm:text-base">
          {left ? finalReviewStrings.review.left(left) : finalReviewStrings.review.bar}
        </p>
        <div className="flex min-w-0 items-center justify-end">
          {round && round.queue[0] ? (
            <ReviewMenu
              current={round.queue[0]}
              flag={marks.get(cardKey(round.queue[0])) ?? flagOf(data, round.queue[0])}
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

// The final review asks only cards already seen, which have their row.
function flagOf(data: StudyData, card: CardRef): number {
  /* v8 ignore next */
  return data.rows.get(cardKey(card))?.flag ?? 0;
}
