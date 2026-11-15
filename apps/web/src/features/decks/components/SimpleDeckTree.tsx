// The simple deck list: what is left today in minutes, mastery, and the switch of each week or lecture.

import type { Counts } from '@qv/srs';
import { activeUnits, EMPTY_PLAN } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { usePreferences, useSetActivation } from '../../progress/queries';
import { useCollapsed } from '../hooks/useCollapsed';
import { allNodes, treeRows } from '../model/deckTree';
import { DeckTreeRow } from './DeckTreeRow';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { decksStrings as s } from '../strings';

export function SimpleDeckTree({
  root,
  counts,
  plan,
  mastery,
  label = s.tree.label,
  upTo,
}: {
  root: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  plan: StudyPlan | undefined;
  mastery: Map<string, number> | undefined;
  label?: string;
  upTo?: number;
}) {
  const { collapsed, toggle } = useCollapsed();
  const activate = useSetActivation();
  const { prefs } = usePreferences();
  const known = plan ?? EMPTY_PLAN;
  const active = activeUnits(allNodes(root), known);
  const rows = treeRows(root, known, collapsed, upTo);
  return (
    <>
      <ul aria-label={label} className="divide-y divide-border text-sm">
        {rows.map((d) => (
          <DeckTreeRow
            key={d.id}
            deck={d}
            root={root}
            plan={plan}
            known={known}
            active={active}
            open={!collapsed.has(d.id)}
            counts={counts}
            mastery={mastery}
            upTo={upTo}
            fullAnki={!!prefs?.fullAnki}
            onToggle={() => toggle(d.id)}
            onActivate={(on) => activate.mutate({ deckId: d.id, active: on })}
          />
        ))}
      </ul>
      {activate.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {s.tree.failed}
        </p>
      ) : null}
    </>
  );
}
