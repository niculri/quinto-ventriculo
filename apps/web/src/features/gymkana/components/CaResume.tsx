// A round of the writing mode that is there when the gymkana opens: to go on with it or drop it, or the last result.
import { Link } from 'react-router';
import { score } from '@qv/gymkana';
import type { CaRound } from '@qv/gymkana';
import { button, card } from '../../../shared/ui/styles';
import { caResumeStrings as s } from './strings/CaResume.strings';

export function CaResume({
  round,
  to,
  onDiscard,
}: {
  round: CaRound;
  to: string;
  onDiscard: () => void;
}) {
  const { right, answered, total } = score(round);
  return (
    <div className={`${card} mt-4 flex flex-wrap items-center gap-3 p-4`} role="status">
      <p className="min-w-0 flex-1 text-sm">
        {round.finished ? s.last(right, total) : s.halfDone(answered, total)}
      </p>
      <div className="flex gap-2">
        {round.finished ? null : (
          <button
            type="button"
            onClick={onDiscard}
            className={`${button.base} ${button.secondary}`}
          >
            {s.discard}
          </button>
        )}
        <Link
          to={to}
          className={`${button.base} ${round.finished ? button.secondary : button.primary}`}
        >
          {round.finished ? s.seeLast : s.resume}
        </Link>
      </div>
    </div>
  );
}
