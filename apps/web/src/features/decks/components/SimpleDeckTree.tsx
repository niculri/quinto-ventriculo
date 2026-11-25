// The simple deck list: the cards seen and what is left today of each deck, a switch for each topic or lecture (a
// week's turns all its topics), «Estudiar» that turns on what is off, and the notice to undo that.

import type { Counts } from '@qv/srs';
import { activation, EMPTY_PLAN } from '@qv/study';
import type { SeenCounts, StudyPlan } from '@qv/study';
import { ActionToast } from '../../../shared/ui/Toast';
import { usePreferences } from '../../progress/queries';
import { useDeckSwitches } from '../hooks/useDeckSwitches';
import { useCollapsed } from '../hooks/useCollapsed';
import { activationNotice } from '../model/activationNotice';
import {
  allNodes,
  rowsToTurnOn,
  rowSwitch,
  switchRows,
  treeRows,
  visibleChildren,
} from '../model/deckTree';
import { DeckTreeRow } from './DeckTreeRow';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { simpleDeckTreeStrings as s } from './strings/SimpleDeckTree.strings';

export function SimpleDeckTree({
  root,
  counts,
  plan,
  seen,
  label = s.tree.label,
  upTo,
}: {
  root: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  plan: StudyPlan | undefined;
  seen: SeenCounts | undefined;
  label?: string;
  upTo?: number;
}) {
  const { collapsed, toggle } = useCollapsed();
  const { prefs } = usePreferences();
  const { notice, failed, starting, save, turnOnAndStudy } = useDeckSwitches(root.id);
  const known = plan ?? EMPTY_PLAN;
  const nodes = allNodes(root);
  const a = activation(nodes, known);
  const rows = treeRows(root, known, collapsed, upTo);
  return (
    <>
      <ul aria-label={label} className="divide-y divide-border text-sm">
        {rows.map((d) => {
          const row = rowSwitch(d, nodes, a);
          const turnOn = plan ? rowsToTurnOn(d, nodes, a, row) : [];
          return (
            <DeckTreeRow
              key={d.id}
              deck={d}
              root={root}
              row={row}
              ready={!!plan}
              medianAnswerMs={known.medianAnswerMs}
              open={!collapsed.has(d.id)}
              foldable={
                (upTo === undefined || d.depth < upTo) && visibleChildren(d, known).length > 0
              }
              counts={counts}
              seen={seen}
              fullAnki={!!prefs?.fullAnki}
              turnsOn={turnOn.length > 0}
              busy={starting === d.id}
              onToggle={() => toggle(d.id)}
              onSwitch={(on) => save(switchRows(d, a, on))}
              onStudy={() => turnOnAndStudy(d, turnOn)}
            />
          );
        })}
      </ul>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {s.tree.failed}
        </p>
      ) : null}
      {notice ? (
        <ActionToast
          action={s.tree.undo}
          onAction={() => save(notice.undo)}
          closeLabel={s.tree.close}
          onClose={activationNotice.clear}
        >
          {s.tree.turnedOn(notice.label)}
        </ActionToast>
      ) : null}
    </>
  );
}
