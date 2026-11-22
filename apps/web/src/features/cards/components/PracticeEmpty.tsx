// «Practicar estas» with no card to practice, and the way back to the list.

import { Link } from 'react-router';
import { button } from '../../../shared/ui/styles';
import { practiceEmptyStrings } from './strings/PracticeEmpty.strings';
import { cardsListViewStrings } from './strings/CardsListView.strings';

export function PracticeEmpty({ back }: { back: string }) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-2 py-6">
      <h1 className="font-serif text-2xl font-semibold">{practiceEmptyStrings.practice.nothing}</h1>
      <p className="mt-2 text-muted">{cardsListViewStrings.noMatch}</p>
      <Link to={back} className={`${button.base} ${button.primary} mt-6`}>
        {practiceEmptyStrings.practice.backToCards}
      </Link>
    </div>
  );
}
