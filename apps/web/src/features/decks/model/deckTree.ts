// The simple deck list as a list of rows: which subdecks show (an Extras only when its assessment includes them),
// which are folded, and which weeks or lectures are on.

import { includesExtras, isExtras, UNIT_DEPTH } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { ancestry, hasPage } from '../../catalog/model/tree';
import type { CourseDeckNode, DeckNode } from '../../catalog/model/tree';

function assessmentOf(node: DeckNode): DeckNode | null {
  return ancestry(node).find((n) => n.depth === 3) ?? null;
}

/** A subdeck without cards has no page, so it is not listed either. */
export function visibleChildren(node: DeckNode, plan: StudyPlan): CourseDeckNode[] {
  return node.children.filter(
    (c): c is CourseDeckNode =>
      hasPage(c) && (!isExtras(c.name) || includesExtras(plan, assessmentOf(c)?.id ?? '')),
  );
}

export function treeRows(
  root: CourseDeckNode,
  plan: StudyPlan,
  collapsed: Set<string>,
  upTo: number | undefined,
): CourseDeckNode[] {
  const rows: CourseDeckNode[] = [];
  const walk = (n: DeckNode) => {
    for (const c of visibleChildren(n, plan)) {
      rows.push(c);
      if (!collapsed.has(c.id) && (upTo === undefined || c.depth < upTo)) walk(c);
    }
  };
  walk(root);
  return rows;
}

export function allNodes(node: DeckNode): DeckNode[] {
  let top = node;
  while (top.parent && top.depth > 3) top = top.parent;
  const out = [top];
  for (const child of out) out.push(...child.children);
  return out;
}

export function isOn(node: DeckNode, active: Set<string>): boolean {
  const unit = ancestry(node).find((n) => n.depth === UNIT_DEPTH);
  return !unit || active.has(unit.id);
}
