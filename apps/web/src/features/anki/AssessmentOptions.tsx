import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_NEW_PER_DAY, includesExtras, isExtras, minutesText } from '../study/simple';
import type { StudyPlan } from '../study/simple';
import {
  DEFAULT_FINAL_REVIEW_DAYS,
  FINAL_REVIEW_OPTIONS,
  LONGEST_STATUS,
  dateOfDay,
  dayOfDate,
  isExamDate,
  longDate,
  shortDate,
} from '../study/pace';
import type { AssessmentView, PaceOption } from '../study/pace';
import { roughToday, useSaveAssessmentSetting } from '../study/queries';
import type { AssessmentSetting } from '../study/repository';
import { Skeleton } from '../../ui/Loading';
import { Reserved } from '../../ui/Reserved';
import { card } from '../../ui/styles';
import { Switch } from '../../ui/Switch';
import { descendants } from './tree';
import type { DeckNode } from './tree';

const MAX_NEW_PER_DAY = 9999;

/**
 * What the student chooses for an assessment: how many new cards a day, or the date of the test and the days left for
 * reviewing, which compute them, and, if it has Extras (not all of them do), whether they count. What goes with the date
 * only appears with a date.
 */
export function AssessmentOptions({
  node,
  plan,
  view,
}: {
  node: DeckNode;
  /** Undefined or null while they load. */
  plan: StudyPlan | undefined;
  view: AssessmentView | null;
}) {
  const numberId = useId();
  const dateId = useId();
  const save = useSaveAssessmentSetting();
  const stored = plan?.assessments.find((a) => a.deckId === node.id);
  const base: AssessmentSetting = stored ?? {
    deckId: node.id,
    includeExtras: false,
    newPerDay: null,
  };
  const value = stored?.newPerDay ?? DEFAULT_NEW_PER_DAY;
  const extras = plan ? includesExtras(plan, node.id) : false;
  const hasExtras = descendants(node).some((n) => isExtras(n.name));
  const date = stored?.examDate ?? '';

  // What is being typed, until it is saved; a change from elsewhere replaces it.
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const [dateText, setDateText] = useState(date);
  const [shownDate, setShownDate] = useState(date);
  if (shownDate !== date) {
    setShownDate(date);
    setDateText(date);
  }

  const commit = () => {
    const n = Number(text);
    const next = Number.isFinite(n) && text.trim() ? Math.round(n) : value;
    const fixed = Math.min(MAX_NEW_PER_DAY, Math.max(0, next));
    setText(String(fixed));
    if (fixed !== value) save.mutate({ ...base, newPerDay: fixed });
  };
  const setDate = (next: string | null) => {
    setDateText(next ?? '');
    if ((next ?? '') === date) return;
    save.mutate({
      ...base,
      examDate: next,
      examDateSetAt: next ? new Date().toISOString() : null,
    });
  };

  // While it loads, what this browser remembers: a student with a date does not see the page jump every time.
  const hintKey = `qv-exam-date:${node.id}`;
  const [hint] = useState(() => {
    try {
      return localStorage.getItem(hintKey) === '1';
    } catch {
      return false;
    }
  });
  const showsDate = plan ? !!date : hint;
  useEffect(() => {
    if (!plan) return;
    try {
      if (date) localStorage.setItem(hintKey, '1');
      else localStorage.removeItem(hintKey);
    } catch {
      // blocked storage: it only costs a small jump on loading
    }
  }, [plan, date, hintKey]);

  const kind = view?.pace.kind;
  // The date decides: the field stays in sight, without editing, and says so.
  const computed = kind === 'computed' || kind === 'final-review' || kind === 'finished';
  const locked = !view || computed || kind === 'nothing-on';
  const shownNumber =
    !view || kind === 'nothing-on' ? '' : computed ? String(view.pace.newPerDay) : text;
  const suggested = suggestedDateOf(node);
  const manualHelp = `En todo ${node.label}, sumando lo que tengas activado. Si no lo cambias, son ${DEFAULT_NEW_PER_DAY}.`;

  return (
    <section aria-label={`Opciones de ${node.label}`} className={`${card} mt-6 p-4 sm:p-6`}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:gap-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={numberId} className="text-sm font-medium">
              Tarjetas nuevas por día
            </label>
            <Reserved longest={manualHelp} className="mt-0.5 text-xs text-muted">
              {computed || kind === 'nothing-on'
                ? `Lo calcula el sitio con tu fecha. Si la sacas, vuelve a ser ${value}.`
                : manualHelp}
            </Reserved>
          </div>
          <input
            id={numberId}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_NEW_PER_DAY}
            disabled={locked}
            placeholder="—"
            value={shownNumber}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => !locked && commit()}
            onKeyDown={(e) => e.key === 'Enter' && !locked && commit()}
            className="w-20 flex-none rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm tabular-nums disabled:bg-surface-2 disabled:text-muted"
          />
        </div>

        <div className="flex items-start justify-between gap-x-4 gap-y-2 max-sm:flex-wrap max-sm:border-t max-sm:border-border max-sm:pt-4">
          <div className="min-w-0">
            <label htmlFor={dateId} className="text-sm font-medium sm:whitespace-nowrap">
              Fecha de la prueba
            </label>
            <p className="mt-0.5 text-xs text-muted">Opcional: pon la tuya.</p>
            {suggested ? (
              // In its place also once chosen.
              <button
                type="button"
                disabled={!plan}
                onClick={() => setDate(suggested)}
                className={`mt-1 text-left text-xs font-medium text-brand hover:underline ${date === suggested ? 'invisible' : ''}`}
              >
                Usar el {longDate(suggested)}
              </button>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-1">
            <input
              id={dateId}
              type="date"
              disabled={!plan}
              min={dateOfDay(roughToday())}
              value={dateText}
              onChange={(e) => {
                setDateText(e.target.value);
                // While somebody types, the field goes through unfinished dates and years like 0020.
                if (isExamDate(e.target.value)) setDate(e.target.value);
              }}
              onBlur={() => {
                if (dateText === '') setDate(null);
                else if (!isExamDate(dateText)) setDateText(date);
              }}
              className="w-[9.5rem] rounded-lg border border-border bg-surface px-2 py-2 text-sm tabular-nums disabled:bg-surface-2 disabled:text-muted"
            />
            <button
              type="button"
              aria-label="Sacar la fecha"
              title="Sacar la fecha"
              onClick={() => setDate(null)}
              className={`rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink ${date ? '' : 'invisible'}`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {showsDate ? (
        <div className="mt-4 border-t border-border pt-4">
          <p id={`${dateId}-final`} className="text-sm font-medium">
            ¿Cuántos días quieres dejar solo para repasar?
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Son los últimos días antes de la prueba: ya no salen tarjetas nuevas y repasas lo que
            viste. Mientras más días dejes, más nuevas por día te tocan hasta entonces. Si cumples
            lo de cada día, alcanzas a ver todo lo activado.
          </p>
          <div
            role="radiogroup"
            aria-labelledby={`${dateId}-final`}
            className="mt-2 grid grid-cols-3 gap-2"
          >
            {FINAL_REVIEW_OPTIONS.map(({ days, name }) => (
              <FinalDaysChoice
                key={days}
                days={days}
                name={name}
                option={view?.options.find((o) => o.finalDays === days) ?? null}
                checked={(stored?.finalReviewDays ?? DEFAULT_FINAL_REVIEW_DAYS) === days}
                disabled={!view}
                group={`${dateId}-radio`}
                onChoose={() => save.mutate({ ...base, finalReviewDays: days })}
              />
            ))}
          </div>
          {/* Its lines keep their place whatever they say: a switch below must not move. */}
          <Reserved longest={LONGEST_STATUS} className="mt-3 text-sm text-muted">
            {view ? <p role="status">{view.status}</p> : <Skeleton className="h-5 w-3/4" />}
          </Reserved>
        </div>
      ) : null}

      {hasExtras ? (
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Incluir extras</p>
            <p className="mt-0.5 text-xs text-muted">
              Tarjetas con más detalle de lo que tengas activado, por si te sobra tiempo.
            </p>
          </div>
          {plan ? (
            <Switch
              label="Incluir extras"
              checked={extras}
              onChange={(on) => save.mutate({ ...base, includeExtras: on })}
            />
          ) : (
            <Skeleton className="h-6 w-10 rounded-full" />
          )}
        </div>
      ) : null}
      {/* It can only happen after touching something: below everything, it does not push the options. */}
      {save.isError ? (
        <p role="alert" className="mt-3 text-sm text-state-learn">
          No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.
        </p>
      ) : null}
    </section>
  );
}

/** The author's date, if it is still to come: one that passed does not interest a student of another year. */
function suggestedDateOf(node: DeckNode): string | null {
  const date = node.course?.assessments.find((a) => a.id === node.assessmentId)?.suggestedDate;
  return date && dayOfDate(date) >= roughToday() ? date : null;
}

/** A choice and what it means, with numbers; the same lines with or without them. */
function FinalDaysChoice({
  days,
  name,
  option,
  checked,
  disabled,
  group,
  onChoose,
}: {
  days: number;
  name: string;
  option: PaceOption | null;
  checked: boolean;
  disabled: boolean;
  group: string;
  onChoose: () => void;
}) {
  const label = days === 1 ? '1 día' : `${days} días`;
  const number = option?.newPerDay ?? null;
  return (
    <label
      className={`relative block rounded-lg border px-1.5 py-2 whitespace-nowrap min-[360px]:px-2 sm:px-3 ${
        disabled ? 'opacity-60' : 'cursor-pointer hover:border-border-strong'
      } ${checked && !disabled ? 'border-brand bg-brand-soft' : 'border-border'}`}
    >
      <input
        type="radio"
        name={group}
        checked={checked}
        disabled={disabled}
        onChange={onChoose}
        aria-label={`${label} solo para repasar: ${name}`}
        className="peer absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
      {/* On a phone the name does not fit beside the days: under them. */}
      <span className="block text-sm font-medium">
        {label}
        <span className="hidden sm:inline"> · {name}</span>
      </span>
      <span className="block text-xs font-medium sm:hidden">{name}</span>
      <span className="block text-xs text-muted max-[359px]:text-[0.6875rem]">
        {option?.lastNewDate ? (
          <>
            <span className="hidden sm:inline">Nuevas hasta el </span>
            <span className="sm:hidden">Hasta </span>
            {shortDate(option.lastNewDate)}
          </>
        ) : number === null ? (
          '—'
        ) : (
          'Sin nuevas'
        )}
      </span>
      <span className="block text-xs text-muted tabular-nums max-[359px]:text-[0.6875rem]">
        {number === null ? (
          '\u00a0'
        ) : (
          <>
            {number.toLocaleString('es-CL')}
            <span className="hidden sm:inline"> {number === 1 ? 'nueva' : 'nuevas'}</span> al día
          </>
        )}
      </span>
      <span className="block text-xs text-muted tabular-nums max-[359px]:text-[0.6875rem]">
        {option?.minutes === null || option?.minutes === undefined ? (
          '\u00a0'
        ) : (
          <>
            {minutesText(option.minutes)}
            <span className="hidden sm:inline"> al día</span>
          </>
        )}
      </span>
    </label>
  );
}
