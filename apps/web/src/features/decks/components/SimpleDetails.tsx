// Under «Estudiar»: the catch-up plan or what to turn on, the subdecks and a word when the load is big.

import type { Counts } from '@qv/srs';
import { Reserved } from '../../../shared/ui/Reserved';
import {
  catchUpText,
  EMPTY_PLAN,
  estimateMinutes,
  HEAVY_LOAD_MINUTES,
  LONGEST_CATCH_UP,
} from '@qv/study';
import type { CatchUp, StudyPlan } from '@qv/study';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { visibleChildren } from '../model/deckTree';
import { SimpleDeckTree } from './SimpleDeckTree';
import { decksStrings as s } from '../strings';

export function SimpleDetails({
  node,
  counts,
  mastery,
  plan,
  catchUp,
}: {
  node: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  mastery: Map<string, number> | undefined;
  plan: StudyPlan | undefined;
  catchUp: CatchUp | null;
}) {
  const own = counts?.get(node.id);
  const known = plan ?? EMPTY_PLAN;
  const minutes = own ? estimateMinutes(own, known.medianAnswerMs) : 0;
  return (
    <>
      <Reserved longest={LONGEST_CATCH_UP} className="mt-3 text-sm text-muted">
        {catchUp ? (
          <p role="status" className="font-medium text-state-learn">
            {catchUpText(catchUp)}
          </p>
        ) : (
          <p>{s.panel.turnOn}</p>
        )}
      </Reserved>
      {visibleChildren(node, known).length ? (
        <div className="mt-5">
          <SimpleDeckTree
            root={node}
            counts={counts}
            plan={plan}
            mastery={mastery}
            label={s.panel.subdecks}
          />
        </div>
      ) : null}
      <p
        className={`mt-3 text-sm text-muted ${minutes >= HEAVY_LOAD_MINUTES ? '' : 'invisible'}`}
        aria-hidden={minutes < HEAVY_LOAD_MINUTES}
      >
        {s.panel.heavy}
      </p>
    </>
  );
}
