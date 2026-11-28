// One kind of filter of the writing mode (regions, sources or priorities): each value with its stations and a switch.
// The number is what the switch adds with the other filters as chosen, beside all the stations it has.
import { Switch } from '../../../shared/ui/Switch';
import { filterListStrings as s } from './strings/FilterList.strings';

export interface FilterOption<T> {
  value: T;
  label: string;
  /** The stations it adds with the other filters as chosen. */
  count: number;
  /** All its stations. */
  total: number;
}

export function FilterList<T>({
  title,
  options,
  chosen,
  onChange,
}: {
  title: string;
  options: readonly FilterOption<T>[];
  chosen: readonly T[];
  onChange: (chosen: T[]) => void;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="float-left w-full text-sm font-medium">{title}</legend>
      <ul className="clear-both divide-y divide-border pt-1 text-sm">
        {options.map((o) => (
          <li key={String(o.value)}>
            <label className="flex cursor-pointer items-center gap-4 py-2.5">
              <span className="min-w-0 flex-1 break-words">{o.label}</span>
              <span className="flex-none text-muted tabular-nums">
                {s.stations(o.count, o.total)}
              </span>
              <Switch
                label={o.label}
                checked={chosen.includes(o.value)}
                onChange={(on) =>
                  onChange(
                    options
                      .map((x) => x.value)
                      .filter((v) => (v === o.value ? on : chosen.includes(v))),
                  )
                }
              />
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
