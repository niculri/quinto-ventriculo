// Under «Estudiar»: the catch-up plan, a word when the load is big or what to turn on, in one reserved line, and the
// subdecks (nothing under them, so the list ends where its last row does).

import type { Counts } from '@qv/srs';
import { Reserved } from '../../../shared/ui/Reserved';
import {
  catchUpText,
  EMPTY_PLAN,
  estimateMinutes,
  HEAVY_LOAD_MINUTES,
  LONGEST_CATCH_UP,
} from '@qv/study';
import type { CatchUp, SeenCounts, StudyPlan } from '@qv/study';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { SUBDECKS_ANCHOR, visibleChildren } from '../model/deckTree';
import { SimpleDeckTree } from './SimpleDeckTree';
import { simpleDetailsStrings as s } from './strings/SimpleDetails.strings';

export function SimpleDetails({
  node,
  counts,
  seen,
  plan,
  catchUp,
}: {
  node: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  seen: SeenCounts | undefined;
  plan: StudyPlan | undefined;
  catchUp: CatchUp | null;
}) {
  const own = counts?.get(node.id);
  const known = plan ?? EMPTY_PLAN;
  const minutes = own ? estimateMinutes(own, known.medianAnswerMs) : 0;
  return (
    <>
      <Reserved
        longest={[LONGEST_CATCH_UP, s.panel.heavy, s.panel.turnOn]}
        className="mt-3 text-sm text-muted"
      >
        {catchUp ? (
          <p role="status" className="font-medium text-state-learn">
            {catchUpText(catchUp)}
          </p>
        ) : (
          <p>{minutes >= HEAVY_LOAD_MINUTES ? s.panel.heavy : s.panel.turnOn}</p>
        )}
      </Reserved>
      {visibleChildren(node, known).length ? (
        <div id={SUBDECKS_ANCHOR} className="mt-5 scroll-mt-24">
          <SimpleDeckTree
            root={node}
            counts={counts}
            plan={plan}
            seen={seen}
            label={s.panel.subdecks}
          />
        </div>
      ) : null}
    </>
  );
}
