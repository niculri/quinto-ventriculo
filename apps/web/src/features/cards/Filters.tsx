import type { ReactNode } from 'react';
import type { CardOrigin } from '@qv/schema';
import { Switch } from '../../ui/Switch';
import { StatusDot } from './CardList';
import { KIND_FILTERS, ORIGIN_FILTERS, STATE_FILTERS } from './model';
import type { Facets, KindFilter, StateFilter } from './model';

/**
 * The filters of the cards page, in the right column (as an article's index) or in a panel on narrower screens:
 * «Estado», «Origen» and «Tipo», each option with how many notes it would leave. An option that would leave none is
 * there, with its 0, and cannot be chosen; nothing appears or goes away. While the cards load, the counts wait in
 * their places.
 */
export function CardFilters({
  facets,
  state,
  origins,
  kind,
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
  hideAnswers: boolean;
  onState: (s: StateFilter) => void;
  onOrigin: (o: CardOrigin, on: boolean) => void;
  onKind: (k: KindFilter) => void;
  onHideAnswers: (on: boolean) => void;
  /** The rail and the panel can be on the page at the same time: their radios need their own names. */
  idPrefix: string;
}) {
  const count = (n: number | undefined, width = 'w-12') => (
    <span className={`ml-auto ${width} flex-none text-right text-xs text-muted tabular-nums`}>
      {facets && n !== undefined ? n.toLocaleString('es-CL') : ''}
    </span>
  );
  return (
    <div className="space-y-5 text-sm">
      <Section title="Mostrar">
        <label className="flex items-center gap-3 py-1">
          <span className="flex-1">Ocultar respuestas</span>
          <Switch label="Ocultar respuestas" checked={hideAnswers} onChange={onHideAnswers} />
        </label>
      </Section>

      <Section title="Estado">
        <div role="radiogroup" aria-label="Estado" className="space-y-0.5">
          {STATE_FILTERS.map((s) => {
            const n = facets?.state[s.value];
            const disabled = !!facets && n === 0 && s.value !== state;
            return (
              <Choice
                key={s.value}
                name={`${idPrefix}-state`}
                checked={state === s.value}
                disabled={disabled}
                onChange={() => onState(s.value)}
              >
                {s.label}
                {count(n)}
              </Choice>
            );
          })}
        </div>
      </Section>

      <Section title="Origen">
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
                  {count(n, 'w-9')}
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
      </Section>

      <Section title="Tipo">
        <div role="radiogroup" aria-label="Tipo" className="space-y-0.5">
          {KIND_FILTERS.map((k) => {
            const n = facets?.kind[k.value];
            const disabled = !!facets && n === 0 && k.value !== kind;
            return (
              <Choice
                key={k.value}
                name={`${idPrefix}-kind`}
                checked={kind === k.value}
                disabled={disabled}
                onChange={() => onKind(k.value)}
              >
                {k.label}
                {count(n)}
              </Choice>
            );
          })}
        </div>
      </Section>

      <Section title="Cada punto es una tarjeta">
        <ul className="space-y-1.5 text-xs text-muted">
          {(
            [
              ['new', 'Sin ver'],
              ['seen', 'Vista'],
              ['hard', 'Me cuesta'],
              ['hidden', 'Oculta'],
            ] as const
          ).map(([s, label]) => (
            <li key={s} className="flex items-center gap-2">
              <span className="flex w-3 justify-center">
                <StatusDot status={s} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Choice({
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
        checked
          ? 'bg-brand-soft font-medium text-brand'
          : disabled
            ? 'opacity-50'
            : 'hover:bg-surface-2'
      } ${disabled ? '' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        // Over the whole row, invisible: a click anywhere on it chooses it.
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
      />
      {children}
    </label>
  );
}
