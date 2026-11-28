// The simple deck list as a list of rows: which subdecks show (an Extras only when its assessment includes them),
// which are folded, and what each row's switch is: a topic or lecture, a week of topics, or none.

import {
  activation,
  includesExtras,
  isExtras,
  switchesUnder,
  topicRows,
  unitRows,
  unitState,
  UNIT_DEPTH,
} from '@qv/study';
import type { Activation, StudyPlan } from '@qv/study';
import type { DeckActivation } from '@qv/schema/user';
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

/**
 * `switch`: a topic or a lecture; `unit`: a week of topics, on when all are; `inside`: under a switch (Extras), on with
 * it; `above`: an assessment or course, on when anything below is.
 */
export type RowSwitch =
  | { kind: 'switch'; on: boolean }
  | { kind: 'unit'; on: number; total: number }
  | { kind: 'inside' | 'above'; on: boolean };

export function rowSwitch(node: DeckNode, decks: readonly DeckNode[], a: Activation): RowSwitch {
  if (a.switches.has(node.id)) return { kind: 'switch', on: a.on.has(node.id) };
  const unit = unitState(a, node.id);
  if (unit) return { kind: 'unit', ...unit };
  const on = switchesUnder(decks, a, node.id).some((id) => a.on.has(id));
  return { kind: node.depth > UNIT_DEPTH ? 'inside' : 'above', on };
}

export const isOff = (row: RowSwitch) => (row.kind === 'unit' ? row.on === 0 : !row.on);

/** Where a deck's page lists its subdecks: «Elegir qué estudiar» goes there. */
export const SUBDECKS_ANCHOR = 'que-estudiar';

/** Nothing of a deck is on yet, and its list has what to turn on: its «Estudiar» would open an empty session. */
export function nothingOnToStudy(node: DeckNode, plan: StudyPlan, listed: boolean): boolean {
  if (!listed) return false;
  const nodes = allNodes(node);
  return isOff(rowSwitch(node, nodes, activation(nodes, plan)));
}

/** What its switch saves: a topic or lecture (with its week, when that leaves the week off), a week with all its topics. */
export function switchRows(node: DeckNode, a: Activation, active: boolean): DeckActivation[] {
  return a.switches.has(node.id) ? topicRows(a, node.id, active) : unitRows(a, node.id, active);
}

/** What «Estudiar» turns on first: nothing if something of it is on, else what it depends on (never a whole course). */
export function rowsToTurnOn(
  node: DeckNode,
  decks: readonly DeckNode[],
  a: Activation,
  row: RowSwitch,
): DeckActivation[] {
  if (!isOff(row) || row.kind === 'above') return [];
  if (row.kind === 'inside') {
    return switchesUnder(decks, a, node.id).map((deckId) => ({ deckId, active: true }));
  }
  return switchRows(node, a, true);
}
