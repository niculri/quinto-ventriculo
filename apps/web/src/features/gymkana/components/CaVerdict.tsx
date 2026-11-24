// The verdict of a station: right or wrong (and why), what was written, the name, and the button to turn it around.
import type { CaResult } from '@qv/gymkana';
import { button } from '../../../shared/ui/styles';
import { RIGHT, WRONG } from '../model/verdict';
import { caVerdictStrings as s } from './strings/CaVerdict.strings';

function title(r: CaResult): string {
  if (r.correct) return r.manual || r.score >= 1 ? s.right : s.rightTypo;
  return r.timedOut && !r.manual ? s.timedOut : s.wrong;
}

export function CaVerdict({
  result,
  name,
  onToggle,
}: {
  result: CaResult;
  name: string;
  onToggle: () => void;
}) {
  const written = result.text.trim();
  return (
    <div className="min-w-0 flex-1 text-sm" role="status">
      <p className={`font-semibold ${result.correct ? RIGHT : WRONG}`}>
        {result.correct ? '✓ ' : '✗ '}
        {title(result)}
        {result.manual ? s.mine : ''}
      </p>
      <p className="mt-0.5 truncate text-muted">
        {s.wrote}
        {written ? result.correct ? written : <del>{written}</del> : <i>{s.nothing}</i>}
      </p>
      <p className="mt-0.5 truncate">
        {s.answerIs}
        <b>{name}</b>
      </p>
      <button
        type="button"
        onClick={onToggle}
        className={`${button.base} ${button.ghost} -ml-2.5 mt-1`}
      >
        {result.correct ? s.countWrong : s.countRight}
      </button>
    </div>
  );
}
