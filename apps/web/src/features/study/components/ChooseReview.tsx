// The start of a final review: everything seen, or only what was marked and hard.
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { button, card } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import type { CardRef } from '../../progress/api/repository';
import { studyStrings } from '../strings';

export function ChooseReview({
  node,
  pools,
  onChoose,
}: {
  node: CourseDeckNode;
  pools: { all: CardRef[]; hard: CardRef[] };
  onChoose: (cards: CardRef[]) => void;
}) {
  const option = (title: string, text: string, cards: CardRef[]) => (
    <button
      type="button"
      disabled={cards.length === 0}
      onClick={() => onChoose(cards)}
      className={`${card} block w-full p-4 text-left transition hover:border-border-strong disabled:pointer-events-none disabled:opacity-60`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className="flex-none text-sm text-muted tabular-nums">
          {studyStrings.cards(cards.length)}
        </span>
      </span>
      <span className="mt-1 block text-sm text-muted">{text}</span>
    </button>
  );
  return (
    <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-2 py-6">
      <h1 className="font-serif text-2xl font-semibold">{studyStrings.review.title(node.label)}</h1>
      {pools.all.length === 0 ? (
        <>
          <p className="mt-2 text-muted">{studyStrings.review.nothingSeen}</p>
          <Link to={paths.deck(node.ref)} className={`${button.base} ${button.primary} mt-6`}>
            {studyStrings.backTo(node.label)}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">{studyStrings.review.noDates}</p>
          <div className="mt-6 space-y-3">
            {option(studyStrings.review.allTitle, studyStrings.review.allText, pools.all)}
            {option(studyStrings.review.hardTitle, studyStrings.review.hardText, pools.hard)}
          </div>
        </>
      )}
    </div>
  );
}
