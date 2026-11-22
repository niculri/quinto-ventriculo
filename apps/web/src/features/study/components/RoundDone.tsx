// The end of a round of review or practice: how many cards and how many «Otra vez».
import { Link } from 'react-router';
import { PartyPopper } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import type { Round } from '@qv/study';
import { roundDoneStrings } from './strings/RoundDone.strings';
import { chooseReviewStrings } from './strings/ChooseReview.strings';

export function RoundDone({
  round,
  deckPath,
  label,
  onAgain,
  title = roundDoneStrings.review.doneTitle,
  againLabel = roundDoneStrings.review.again,
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
        {chooseReviewStrings.cards(round.total)}
        {round.again > 0 ? roundDoneStrings.review.againTimes(round.again) : ''}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={deckPath} className={`${button.base} ${button.primary}`}>
          {chooseReviewStrings.backTo(label)}
        </Link>
        <button type="button" onClick={onAgain} className={`${button.base} ${button.secondary}`}>
          {againLabel}
        </button>
      </div>
    </div>
  );
}
