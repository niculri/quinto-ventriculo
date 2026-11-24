// The writing mode's cover: which regions, sources and priorities, how many stations, the time and when to correct,
// and «Comenzar».
import { Play } from 'lucide-react';
import { COUNT_CHOICES, SECONDS_CHOICES } from '@qv/gymkana';
import type { CaPreferences, Correction } from '@qv/gymkana';
import { Select } from '../../../shared/ui/Select';
import { button, card } from '../../../shared/ui/styles';
import { chosenStations, countBy } from '../model/stations';
import type { GymkanaStations } from '../model/stations';
import { FilterList } from './FilterList';
import { caStartStrings as s } from './strings/CaStart.strings';

const COUNTS = COUNT_CHOICES.map((n) => ({ value: String(n), label: n ? String(n) : s.all }));
const SECONDS = SECONDS_CHOICES.map((n) => ({
  value: String(n),
  label: n ? s.secondsN(n) : s.noTime,
}));
const CORRECTIONS: { value: Correction; label: string }[] = [
  { value: 'instant', label: s.instant },
  { value: 'end', label: s.atEnd },
];

export function CaStart({
  data,
  preferences: p,
  replacing,
  onChoose,
  onStart,
}: {
  data: GymkanaStations;
  preferences: CaPreferences;
  replacing: boolean;
  onChoose: (p: CaPreferences) => void;
  onStart: () => void;
}) {
  const chosen = chosenStations(data.stations, p.filter).length;
  return (
    <form
      className={`${card} mt-4 p-4 sm:p-6`}
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!chosen}
          className={`${button.base} ${button.primary} flex-1 py-3 text-base sm:flex-none sm:px-10`}
        >
          <Play className="size-4" aria-hidden="true" />
          {` ${replacing ? s.startOther : s.start}`}
        </button>
        <span className="font-medium max-sm:basis-full">
          {chosen ? s.chosen(chosen) : s.chooseOne}
          {replacing ? (
            <span className="block text-sm font-normal text-muted">{s.replaces}</span>
          ) : null}
        </span>
      </div>

      <CaOptions preferences={p} onChoose={onChoose} />

      <CaFilters data={data} preferences={p} onChoose={onChoose} />
    </form>
  );
}

/** How many stations, the time for each one and when to correct. */
function CaOptions({
  preferences: p,
  onChoose,
}: {
  preferences: CaPreferences;
  onChoose: (p: CaPreferences) => void;
}) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="grid gap-1.5 text-sm font-medium">
        <span aria-hidden="true">{s.count}</span>
        <Select
          label={s.count}
          value={String(p.count)}
          options={COUNTS}
          onChange={(v) => onChoose({ ...p, count: Number(v) })}
        />
      </div>
      <div className="grid gap-1.5 text-sm font-medium">
        <span aria-hidden="true">{s.seconds}</span>
        <Select
          label={s.seconds}
          value={String(p.seconds)}
          options={SECONDS}
          onChange={(v) => onChoose({ ...p, seconds: Number(v) })}
        />
      </div>
      <div className="grid gap-1.5 text-sm font-medium">
        <span aria-hidden="true">{s.correction}</span>
        <Select
          label={s.correction}
          value={p.correction}
          options={CORRECTIONS}
          onChange={(v) => onChoose({ ...p, correction: v })}
        />
      </div>
    </div>
  );
}

/** The regions, sources and priorities there are, each with its switch. */
function CaFilters({
  data: { stations, places },
  preferences: p,
  onChoose,
}: {
  data: GymkanaStations;
  preferences: CaPreferences;
  onChoose: (p: CaPreferences) => void;
}) {
  const regions = countBy(stations, 'region');
  const sources = countBy(stations, 'source');
  const priorities = countBy(stations, 'priority');
  const filter = (f: Partial<CaPreferences['filter']>) =>
    onChoose({ ...p, filter: { ...p.filter, ...f } });
  return (
    <>
      {priorities.size > 1 ? (
        <FilterList
          title={s.priorities}
          options={[...priorities.keys()].sort().map((n) => ({
            value: Number(n),
            label: s.priority(Number(n)),
            count: priorities.get(n)!,
          }))}
          chosen={p.filter.priorities}
          onChange={(priorities) => filter({ priorities })}
        />
      ) : null}
      {places.regions.length ? (
        <FilterList
          title={s.regions}
          options={places.regions.map((r) => ({
            value: r.tag,
            label: r.label,
            count: regions.get(r.tag) ?? 0,
          }))}
          chosen={p.filter.regions}
          onChange={(regions) => filter({ regions })}
        />
      ) : null}
      {places.sources.length > 1 ? (
        <FilterList
          title={s.sources}
          options={places.sources.map((x) => ({
            value: x.label,
            label: x.label,
            count: sources.get(x.label) ?? 0,
          }))}
          chosen={p.filter.sources}
          onChange={(sources) => filter({ sources })}
        />
      ) : null}
    </>
  );
}
