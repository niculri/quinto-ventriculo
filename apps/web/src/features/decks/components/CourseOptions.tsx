// The box on top of a course's deck page: the new cards a day of each of its assessments, saved by assessment as on
// the assessment's own page, with the test's date only read (it is chosen there).

import { Link } from 'react-router';
import { longDate } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { card } from '../../../shared/ui/styles';
import { useAssessmentView } from '../../progress/queries';
import { useDraftOnly } from '../../catalog/hooks/useDraftOnly';
import { deckTitle, hasPage } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useAssessmentOptions } from '../hooks/useAssessmentOptions';
import { MAX_NEW_PER_DAY } from '../model/assessmentOptions';
import { assessmentOptionsStrings } from './strings/AssessmentOptions.strings';
import { courseOptionsStrings as s } from './strings/CourseOptions.strings';

export function CourseOptions({
  node,
  plan,
}: {
  node: CourseDeckNode;
  plan: StudyPlan | undefined;
}) {
  const assessments = node.children.filter(hasPage);
  if (!assessments.length) return null;
  return (
    <section aria-label={s.label(deckTitle(node))} className={`${card} mt-6 p-4 sm:p-6`}>
      <p className="text-sm font-medium">{s.newPerDay}</p>
      <p className="mt-0.5 text-xs text-muted">{s.help}</p>
      <ul className="mt-3 divide-y divide-border">
        {assessments.map((a) => (
          <AssessmentRow key={a.id} node={a} plan={plan} />
        ))}
      </ul>
    </section>
  );
}

function AssessmentRow({ node, plan }: { node: CourseDeckNode; plan: StudyPlan | undefined }) {
  const view = useAssessmentView(node.id);
  const o = useAssessmentOptions(node, plan, view);
  const draftOnly = useDraftOnly(['deck', node.id]);
  const { kind, locked, shownNumber } = o.pace;
  const disabled = locked || draftOnly;
  const byDate = !!o.date && kind !== 'past';
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Link to={paths.deck(node.ref)} className="text-sm font-medium hover:underline">
          {node.label}
        </Link>
        <Reserved longest={s.longestDate} className="mt-0.5 text-xs text-muted">
          {!plan ? (
            <Skeleton className="h-4 w-32" />
          ) : o.date ? (
            s.withDate(longDate(o.date), byDate)
          ) : (
            s.noDate
          )}
        </Reserved>
        {o.save.isError ? (
          <p role="alert" className="mt-1 text-xs text-state-learn">
            {assessmentOptionsStrings.assessment.failed}
          </p>
        ) : null}
      </div>
      <input
        id={o.numberId}
        type="number"
        inputMode="numeric"
        aria-label={s.numberOf(node.label)}
        min={0}
        max={MAX_NEW_PER_DAY}
        disabled={disabled}
        placeholder="—"
        value={shownNumber}
        onChange={(e) => o.setText(e.target.value)}
        onBlur={() => !disabled && o.commit()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && o.commit()}
        className="w-20 flex-none rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm tabular-nums disabled:bg-surface-2 disabled:text-muted"
      />
    </li>
  );
}
