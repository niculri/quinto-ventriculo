// The end of a writing-mode round: how many were right, «Repetir las malas», and each station with what was written
// and the button to turn its verdict around (the wrong ones first, unless it was corrected at the end).
import { Link } from 'react-router';
import { RotateCcw } from 'lucide-react';
import { score, wrongStations } from '@qv/gymkana';
import type { CaResult, CaRound } from '@qv/gymkana';
import { button, card } from '../../../shared/ui/styles';
import type { Station } from '../model/stations';
import { RIGHT, WRONG } from '../model/verdict';
import { caResultsStrings as s } from './strings/CaResults.strings';

export function CaResults({
  round,
  byKey,
  cover,
  onRepeatWrong,
  onToggle,
}: {
  round: CaRound;
  byKey: ReadonlyMap<string, Station>;
  cover: string;
  onRepeatWrong: () => void;
  onToggle: (index: number) => void;
}) {
  const { right, total } = score(round);
  const wrong = wrongStations(round).length;
  const rows = round.stations.map((key, i) => ({
    i,
    station: byKey.get(key)!,
    result: round.results[i] ?? null,
  }));
  const order =
    round.correction === 'end'
      ? rows
      : [...rows.filter((r) => !r.result?.correct), ...rows.filter((r) => r.result?.correct)];
  return (
    <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-2 pb-10">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.title(right, total)}</h1>
      <ScoreBoxes right={right} total={total} />
      <div className="mt-5 flex flex-wrap gap-2">
        {wrong ? (
          <button
            type="button"
            onClick={onRepeatWrong}
            className={`${button.base} ${button.primary}`}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {` ${s.repeatWrong(wrong)}`}
          </button>
        ) : null}
        <Link to={cover} className={`${button.base} ${button.secondary}`}>
          {s.another}
        </Link>
      </div>
      <p className="mt-4 text-sm text-muted">{s.checkNote}</p>
      <h2 id="ca-stations" className="mt-6 text-sm font-semibold">
        {s.stations}
      </h2>
      <ol aria-labelledby="ca-stations" className={`${card} mt-2 divide-y divide-border`}>
        {order.map((row) => (
          <ResultRow key={row.station.key} {...row} onToggle={() => onToggle(row.i)} />
        ))}
      </ol>
    </div>
  );
}

function ScoreBoxes({ right, total }: { right: number; total: number }) {
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
      <div className={`${card} p-3`}>
        <dt className="text-xs text-muted">{s.right}</dt>
        <dd className={`text-2xl font-semibold tabular-nums ${RIGHT}`}>{right}</dd>
      </div>
      <div className={`${card} p-3`}>
        <dt className="text-xs text-muted">{s.wrong}</dt>
        <dd className={`text-2xl font-semibold tabular-nums ${WRONG}`}>{total - right}</dd>
      </div>
      <div className={`${card} p-3`}>
        <dt className="text-xs text-muted">{s.ofRound}</dt>
        <dd className="text-2xl font-semibold tabular-nums">
          {Math.round((100 * right) / total)} %
        </dd>
      </div>
    </dl>
  );
}

function ResultRow({
  i,
  station,
  result,
  onToggle,
}: {
  i: number;
  station: Station;
  result: CaResult | null;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <span
        className={`flex-none font-semibold ${result?.correct ? RIGHT : WRONG}`}
        aria-hidden="true"
      >
        {result?.correct ? '✓' : '✗'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{station.name}</span>
        <span className="block truncate text-muted">
          {result?.text.trim() ? (
            <>
              {s.wrote}
              {result.correct ? result.text : <del>{result.text}</del>}
            </>
          ) : (
            s.nothing
          )}
          {result?.manual ? s.mine : ''}
        </span>
        <span className="block text-xs text-muted">
          {s.station(i + 1)}
          {station.code ? ` · ${station.code}.${String(station.version ?? 1)}` : ''}
        </span>
      </span>
      {result ? (
        <button type="button" onClick={onToggle} className={`${button.base} ${button.ghost}`}>
          {result.correct ? s.countWrong : s.countRight}
        </button>
      ) : null}
    </li>
  );
}
