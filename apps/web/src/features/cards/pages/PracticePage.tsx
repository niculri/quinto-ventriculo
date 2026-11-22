// «Practicar estas»: a round with the cards the list found, on the final review's motor; it changes no date and each
// answer counts as practice (`record_practice()`).

import { paths } from '../../../shared/lib/paths';
import { BackButton } from '../../../shared/ui/BackButton';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { answerBar, studyScreen } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { queryOf } from '../model/urlState';
import { useTitle } from '../../../shared/hooks/useTitle';
import { practiceRoundStrings } from '../components/strings/PracticeRound.strings';
import { practicePageStrings } from './strings/PracticePage.strings';
import { usePracticeCards } from '../hooks/usePracticeCards';
import { PracticeEmpty } from '../components/PracticeEmpty';
import { PracticeRound } from '../components/PracticeRound';

/** The filters are in the URL, so reloading starts the same round again. */
export function PracticePage({ node }: { node: CourseDeckNode }) {
  const { params, cards, first } = usePracticeCards(node);
  const back = paths.cards(node.ref, queryOf(params));
  useTitle(practiceRoundStrings.practice.title);

  let body;
  if (cards.error && !cards.data)
    body = <ErrorWithRetry error={cards.error} onRetry={cards.retry} />;
  else if (cards.missing || cards.changed) body = <PracticeEmpty back={back} />;
  else if (!first) body = <Loading text={practicePageStrings.practice.preparing} />;
  else if (!first.length) body = <PracticeEmpty back={back} />;
  else body = <PracticeRound cards={first} back={back} />;
  return (
    <div className={studyScreen}>
      {first?.length ? (
        body
      ) : (
        <>
          <div className={`${answerBar} min-h-11 pb-2`}>
            <BackButton
              to={back}
              label={practiceRoundStrings.practice.back}
              className="justify-self-start"
            />
            <p className="text-center text-sm font-medium sm:text-base">
              {practiceRoundStrings.practice.title}
            </p>
            <span />
          </div>
          {body}
        </>
      )}
    </div>
  );
}
