// «Qué estás estudiando» under an assessment's cards: how many units are on, and the list to turn them on.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Counts } from '@qv/srs';
import type { StudyPlan } from '@qv/study';
import { UNIT_DEPTH } from '@qv/study';
import { card, tapArea } from '../../../shared/ui/styles';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { SimpleDeckTree } from '../../decks/components/SimpleDeckTree';
import { unitsOf } from '../model/material';
import { courseStrings as s } from '../course.strings';

export function ChooseUnits({
  node,
  counts,
  mastery,
  plan,
}: {
  node: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  mastery: Map<string, number> | undefined;
  plan: StudyPlan;
}) {
  const { total, on } = unitsOf(node, plan);
  // Open while nothing is on, decided once: turning the first one on does not fold the list under the finger.
  const [open, setOpen] = useState(on === 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted hover:text-ink ${tapArea}`}
      >
        <ChevronRight
          className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        {s.units.title}
        {on}
        {s.units.of}
        {total} {s.units.on(on)}
      </button>
      {open ? (
        <div className={`${card} mt-2 p-3 sm:px-5`}>
          <SimpleDeckTree
            root={node}
            counts={counts}
            plan={plan}
            mastery={mastery}
            label={s.units.list(node.label)}
            upTo={UNIT_DEPTH}
          />
        </div>
      ) : null}
    </div>
  );
}
