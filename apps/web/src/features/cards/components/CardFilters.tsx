// The cards page's filters («Estado», «Origen», «Tipo»), each option with how many notes it would leave; one that
// leaves none stays, disabled, so nothing appears or goes away.

import type { CardOrigin } from '@qv/schema';
import { Switch } from '../../../shared/ui/Switch';
import { StatusDot } from './CardStatus';
import { FilterChoice, FilterSection, facetCount } from './FilterParts';
import { KIND_FILTERS, ORIGIN_FILTERS, STATE_FILTERS } from '../model/filters';
import type { Facets, KindFilter, StateFilter } from '../model/filters';
import { cardFiltersStrings } from './strings/CardFilters.strings';

export function CardFilters({
  facets,
  state,
  origins,
  kind,
  failedThatDay = false,
  hideAnswers,
  onState,
  onOrigin,
  onKind,
  onHideAnswers,
  idPrefix,
}: {
  facets: Facets | null;
  state: StateFilter;
  origins: readonly CardOrigin[];
  kind: KindFilter;
  failedThatDay?: boolean;
  hideAnswers: boolean;
  onState: (s: StateFilter) => void;
  onOrigin: (o: CardOrigin, on: boolean) => void;
  onKind: (k: KindFilter) => void;
  onHideAnswers: (on: boolean) => void;
  /** The rail and the panel can be on the page at the same time: their radios need their own names. */
  idPrefix: string;
}) {
  return (
    <div className="space-y-5 text-sm">
      <FilterSection title={cardFiltersStrings.filters.show}>
        <label className="flex items-center gap-3 py-1">
          <span className="flex-1">{cardFiltersStrings.filters.hideAnswers}</span>
          <Switch
            label={cardFiltersStrings.filters.hideAnswers}
            checked={hideAnswers}
            onChange={onHideAnswers}
          />
        </label>
      </FilterSection>
      <StateFilters
        facets={facets}
        state={state}
        failedThatDay={failedThatDay}
        onState={onState}
        idPrefix={idPrefix}
      />
      <OriginFilters facets={facets} origins={origins} onOrigin={onOrigin} />
      <KindFilters facets={facets} kind={kind} onKind={onKind} idPrefix={idPrefix} />
      <Legend />
    </div>
  );
}

function StateFilters({
  facets,
  state,
  failedThatDay,
  onState,
  idPrefix,
}: {
  facets: Facets | null;
  state: StateFilter;
  failedThatDay: boolean;
  onState: (s: StateFilter) => void;
  idPrefix: string;
}) {
  return (
    <FilterSection title={cardFiltersStrings.filters.state}>
      <div role="radiogroup" aria-label={cardFiltersStrings.filters.state} className="space-y-0.5">
        {STATE_FILTERS.map((s) => {
          const n = facets?.state[s.value];
          const disabled = !!facets && n === 0 && s.value !== state;
          return (
            <FilterChoice
              key={s.value}
              name={`${idPrefix}-state`}
              checked={state === s.value}
              disabled={disabled}
              onChange={() => onState(s.value)}
            >
              {s.value === 'failed' && failedThatDay
                ? cardFiltersStrings.filters.failedThatDay
                : s.label}
              {facetCount(facets, n)}
            </FilterChoice>
          );
        })}
      </div>
    </FilterSection>
  );
}

function OriginFilters({
  facets,
  origins,
  onOrigin,
}: {
  facets: Facets | null;
  origins: readonly CardOrigin[];
  onOrigin: (o: CardOrigin, on: boolean) => void;
}) {
  return (
    <FilterSection title={cardFiltersStrings.filters.origin}>
      <ul className="space-y-0.5">
        {ORIGIN_FILTERS.map((o) => {
          const n = facets?.origin[o.value];
          const on = origins.includes(o.value);
          const disabled = !!facets && n === 0 && !on;
          return (
            <li key={o.value}>
              <label
                className={`flex items-center gap-2 rounded-md py-1.5 pl-2 ${disabled ? 'opacity-50' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {facetCount(facets, n, 'w-9')}
                <Switch
                  label={o.label}
                  checked={on}
                  disabled={disabled}
                  onChange={(v) => onOrigin(o.value, v)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </FilterSection>
  );
}

function KindFilters({
  facets,
  kind,
  onKind,
  idPrefix,
}: {
  facets: Facets | null;
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
  idPrefix: string;
}) {
  return (
    <FilterSection title={cardFiltersStrings.filters.kind}>
      <div role="radiogroup" aria-label={cardFiltersStrings.filters.kind} className="space-y-0.5">
        {KIND_FILTERS.map((k) => {
          const n = facets?.kind[k.value];
          const disabled = !!facets && n === 0 && k.value !== kind;
          return (
            <FilterChoice
              key={k.value}
              name={`${idPrefix}-kind`}
              checked={kind === k.value}
              disabled={disabled}
              onChange={() => onKind(k.value)}
            >
              {k.label}
              {facetCount(facets, n)}
            </FilterChoice>
          );
        })}
      </div>
    </FilterSection>
  );
}

function Legend() {
  return (
    <FilterSection title={cardFiltersStrings.filters.legend}>
      <ul className="space-y-1.5 text-xs text-muted">
        {(['new', 'seen', 'hard', 'hidden'] as const).map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="flex w-3 justify-center">
              <StatusDot status={s} />
            </span>
            {cardFiltersStrings.filters.dots[s]}
          </li>
        ))}
      </ul>
    </FilterSection>
  );
}
