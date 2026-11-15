// The full mode's end screen: why nothing is left and when the next cards come.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PartyPopper } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import type { CongratsInfo } from '@qv/study';
import { studyStrings } from '../strings';

/** Anki's congrats.rs: «¡Felicitaciones!…» and when the next cards come. */
export function Congrats({
  info,
  deckPath,
  summary,
}: {
  info: CongratsInfo;
  deckPath: string;
  summary: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">{studyStrings.congrats.title}</h1>
      {summary}
      <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
        {info.learnMessage ? <p>{info.learnMessage}</p> : null}
        {info.reviewLimitReached ? <p>{studyStrings.congrats.reviewLimit}</p> : null}
        {info.newLimitReached ? <p>{studyStrings.congrats.newLimit}</p> : null}
        {info.buried ? <p>{studyStrings.congrats.buried}</p> : null}
        <p>{studyStrings.congrats.dueTomorrow(info.dueTomorrow)}</p>
      </div>
      <Link to={deckPath} className={`${button.base} ${button.primary} mt-8`}>
        {studyStrings.backToDeck}
      </Link>
    </div>
  );
}
