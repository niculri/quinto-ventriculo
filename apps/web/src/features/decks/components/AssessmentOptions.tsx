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
import { roughToday } from '../../progress/hooks/useToday';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { card } from '../../../shared/ui/styles';
import { Switch } from '../../../shared/ui/Switch';
import type { DeckNode } from '../../catalog/model/tree';
import { useAssessmentOptions } from '../hooks/useAssessmentOptions';
import { MAX_NEW_PER_DAY } from '../model/assessmentOptions';
import { FinalDaysChoice } from './FinalDaysChoice';
import { decksStrings as s } from '../strings';

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
    <section aria-label={s.assessment.label(node.label)} className={`${card} mt-6 p-4 sm:p-6`}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:gap-8">
        <NewPerDayField o={o} label={node.label} />
        <ExamDateField o={o} plan={plan} />
      </div>

      {o.showsDate ? <FinalReviewDays o={o} view={view} /> : null}

      {o.hasExtras ? <ExtrasRow o={o} plan={plan} /> : null}
      {o.save.isError ? (
        <p role="alert" className="mt-3 text-sm text-state-learn">
          {s.assessment.failed}
        </p>
      ) : null}
    </section>
  );
}

function NewPerDayField({ o, label }: { o: Options; label: string }) {
  const { kind, computed, locked, shownNumber } = o.pace;
  const manualHelp = s.assessment.manualHelp(label, DEFAULT_NEW_PER_DAY);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={o.numberId} className="text-sm font-medium">
          {s.assessment.newPerDay}
        </label>
        <Reserved longest={manualHelp} className="mt-0.5 text-xs text-muted">
          {computed || kind === 'nothing-on' ? s.assessment.computedHelp(o.value) : manualHelp}
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
          {s.assessment.examDate}
        </label>
        <p className="mt-0.5 text-xs text-muted">{s.assessment.examDateHelp}</p>
        {suggested ? (
          <button
            type="button"
            disabled={!plan}
            onClick={() => o.setDate(suggested)}
            className={`mt-1 text-left text-xs font-medium text-brand hover:underline ${date === suggested ? 'invisible' : ''}`}
          >
            {s.assessment.useSuggested(longDate(suggested))}
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
          aria-label={s.assessment.removeDate}
          title={s.assessment.removeDate}
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
        {s.assessment.finalDays}
      </p>
      <p className="mt-0.5 text-xs text-muted">{s.assessment.finalDaysHelp}</p>
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
        <p className="text-sm font-medium">{s.assessment.extras}</p>
        <p className="mt-0.5 text-xs text-muted">{s.assessment.extrasHelp}</p>
      </div>
      {plan ? (
        <Switch
          label={s.assessment.extras}
          checked={o.extras}
          onChange={(on) => o.save.mutate({ ...o.base, includeExtras: on })}
        />
      ) : (
        <Skeleton className="h-6 w-10 rounded-full" />
      )}
    </div>
  );
}
