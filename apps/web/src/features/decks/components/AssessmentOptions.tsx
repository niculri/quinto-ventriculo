// What the student chooses for an assessment: new cards a day, or the test's date and the days left for reviewing,
// which compute them, and whether its Extras count.

import { X } from 'lucide-react';
import {
  dateOfDay,
  DEFAULT_FINAL_REVIEW_DAYS,
  DEFAULT_NEW_PER_DAY,
  FINAL_REVIEW_OPTIONS,
  isExamDate,
  longDate,
  LONGEST_STATUS,
} from '@qv/study';
import type { AssessmentView, StudyPlan } from '@qv/study';
import { roughToday } from '../../progress/queries';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { card } from '../../../shared/ui/styles';
import { Switch } from '../../../shared/ui/Switch';
import type { DeckNode } from '../../catalog/model/tree';
import { useAssessmentOptions } from '../hooks/useAssessmentOptions';
import { MAX_NEW_PER_DAY } from '../model/assessmentOptions';
import { FinalDaysChoice } from './FinalDaysChoice';

type Options = ReturnType<typeof useAssessmentOptions>;

export function AssessmentOptions({
  node,
  plan,
  view,
}: {
  node: DeckNode;
  plan: StudyPlan | undefined;
  view: AssessmentView | null;
}) {
  const o = useAssessmentOptions(node, plan, view);
  return (
    <section aria-label={`Opciones de ${node.label}`} className={`${card} mt-6 p-4 sm:p-6`}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:gap-8">
        <NewPerDayField o={o} label={node.label} />
        <ExamDateField o={o} plan={plan} />
      </div>

      {o.showsDate ? <FinalReviewDays o={o} view={view} /> : null}

      {o.hasExtras ? <ExtrasRow o={o} plan={plan} /> : null}
      {o.save.isError ? (
        <p role="alert" className="mt-3 text-sm text-state-learn">
          No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.
        </p>
      ) : null}
    </section>
  );
}

function NewPerDayField({ o, label }: { o: Options; label: string }) {
  const { kind, computed, locked, shownNumber } = o.pace;
  const manualHelp = `En todo ${label}, sumando lo que tengas activado. Si no lo cambias, son ${DEFAULT_NEW_PER_DAY}.`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={o.numberId} className="text-sm font-medium">
          Tarjetas nuevas por día
        </label>
        <Reserved longest={manualHelp} className="mt-0.5 text-xs text-muted">
          {computed || kind === 'nothing-on'
            ? `Lo calcula el sitio con tu fecha. Si la sacas, vuelve a ser ${o.value}.`
            : manualHelp}
        </Reserved>
      </div>
      <input
        id={o.numberId}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_NEW_PER_DAY}
        disabled={locked}
        placeholder="—"
        value={shownNumber}
        onChange={(e) => o.setText(e.target.value)}
        onBlur={() => !locked && o.commit()}
        onKeyDown={(e) => e.key === 'Enter' && !locked && o.commit()}
        className="w-20 flex-none rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm tabular-nums disabled:bg-surface-2 disabled:text-muted"
      />
    </div>
  );
}

function ExamDateField({ o, plan }: { o: Options; plan: StudyPlan | undefined }) {
  const { suggested, date, dateText } = o;
  return (
    <div className="flex items-start justify-between gap-x-4 gap-y-2 max-sm:flex-wrap max-sm:border-t max-sm:border-border max-sm:pt-4">
      <div className="min-w-0">
        <label htmlFor={o.dateId} className="text-sm font-medium sm:whitespace-nowrap">
          Fecha de la prueba
        </label>
        <p className="mt-0.5 text-xs text-muted">Opcional: pon la tuya.</p>
        {suggested ? (
          <button
            type="button"
            disabled={!plan}
            onClick={() => o.setDate(suggested)}
            className={`mt-1 text-left text-xs font-medium text-brand hover:underline ${date === suggested ? 'invisible' : ''}`}
          >
            Usar el {longDate(suggested)}
          </button>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-1">
        <input
          id={o.dateId}
          type="date"
          disabled={!plan}
          min={dateOfDay(roughToday())}
          value={dateText}
          onChange={(e) => {
            o.setDateText(e.target.value);
            // While somebody types, the field goes through unfinished dates and years like 0020.
            if (isExamDate(e.target.value)) o.setDate(e.target.value);
          }}
          onBlur={() => {
            if (dateText === '') o.setDate(null);
            else if (!isExamDate(dateText)) o.setDateText(date);
          }}
          className="w-[9.5rem] rounded-lg border border-border bg-surface px-2 py-2 text-sm tabular-nums disabled:bg-surface-2 disabled:text-muted"
        />
        <button
          type="button"
          aria-label="Sacar la fecha"
          title="Sacar la fecha"
          onClick={() => o.setDate(null)}
          className={`rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink ${date ? '' : 'invisible'}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function FinalReviewDays({ o, view }: { o: Options; view: AssessmentView | null }) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p id={`${o.dateId}-final`} className="text-sm font-medium">
        ¿Cuántos días quieres dejar solo para repasar?
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Son los últimos días antes de la prueba: ya no salen tarjetas nuevas y repasas lo que viste.
        Mientras más días dejes, más nuevas por día te tocan hasta entonces. Si cumples lo de cada
        día, alcanzas a ver todo lo activado.
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${o.dateId}-final`}
        className="mt-2 grid grid-cols-3 gap-2"
      >
        {FINAL_REVIEW_OPTIONS.map(({ days, name }) => (
          <FinalDaysChoice
            key={days}
            days={days}
            name={name}
            option={view?.options.find((p) => p.finalDays === days) ?? null}
            checked={(o.stored?.finalReviewDays ?? DEFAULT_FINAL_REVIEW_DAYS) === days}
            disabled={!view}
            group={`${o.dateId}-radio`}
            onChoose={() => o.save.mutate({ ...o.base, finalReviewDays: days })}
          />
        ))}
      </div>
      <Reserved longest={LONGEST_STATUS} className="mt-3 text-sm text-muted">
        {view ? <p role="status">{view.status}</p> : <Skeleton className="h-5 w-3/4" />}
      </Reserved>
    </div>
  );
}

function ExtrasRow({ o, plan }: { o: Options; plan: StudyPlan | undefined }) {
  return (
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
          checked={o.extras}
          onChange={(on) => o.save.mutate({ ...o.base, includeExtras: on })}
        />
      ) : (
        <Skeleton className="h-6 w-10 rounded-full" />
      )}
    </div>
  );
}
