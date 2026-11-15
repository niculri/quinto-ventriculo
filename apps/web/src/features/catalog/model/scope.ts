// The cards page's scope (a course or an assessment) and its units, the weeks and lectures it can be narrowed to.

import type { AssessmentWithNotes, Catalog } from '@qv/schema';
import { scopeStrings } from '../scope.strings';
import { descendants, hasPage } from './tree';
import type { CourseDeckNode, DeckNode } from './tree';

/**
 * Where the cards page is: a course (every assessment of it) or an assessment. Anki goes course by course: there is no
 * page with the cards of several courses, and the scope is in the URL, never in the search's text.
 */
export interface CardsScope {
  node: CourseDeckNode;
  assessments: AssessmentWithNotes[];
  deckIds: string[];
}

export function cardsScope(catalog: Catalog, node: CourseDeckNode): CardsScope {
  const course = catalog.semesters.flatMap((s) => s.courses).find((c) => c.id === node.courseId);
  const ids = descendants(node).map((n) => n.id);
  const withDecks = new Set(
    descendants(node)
      .map((n) => n.assessmentId)
      .filter(Boolean),
  );
  const assessments = (course?.assessments ?? []).filter(
    (a) => withDecks.has(a.id) && (node.depth === 2 || a.id === node.assessmentId),
  );
  return { node, assessments, deckIds: ids };
}

export function lectureOf(node: DeckNode | undefined): DeckNode | undefined {
  let n = node;
  while (n && n.label === 'Extras' && n.parent) n = n.parent;
  return n;
}

export function lectureTitle(scope: DeckNode, lecture: DeckNode | undefined): string {
  if (!lecture) return scopeStrings.otherCards;
  const parts: string[] = [];
  for (let n: DeckNode | null = lecture; n && n !== scope && n.depth > scope.depth; n = n.parent) {
    parts.unshift(n.label);
  }
  return parts.length ? parts.join(' › ') : scope.label;
}

const isExtras = (n: DeckNode) => n.label === 'Extras';
const withCards = (n: DeckNode) => n.cardCount > 0 && !isExtras(n);

/** A unit of the cards page's list of weeks and lectures. */
export interface UnitOption {
  value: string;
  label: string;
}

export function unitOptions(scope: DeckNode, current = ''): UnitOption[] {
  const out: UnitOption[] = [
    {
      value: '',
      label: scope.depth === 2 ? scopeStrings.wholeCourse : scopeStrings.wholeAssessment,
    },
  ];
  for (const child of scope.children.filter(withCards)) {
    out.push({ value: child.slug, label: child.label });
    const inner = child.children.filter(withCards);
    if (inner.length < 2) continue;
    for (const g of inner) {
      out.push({ value: `${child.slug}/${g.slug}`, label: `${child.label} › ${g.label}` });
    }
  }
  // A unit the URL names that the list does not offer (a week's only deck, an «Extras»): shown as chosen, after its week.
  const node = current && !out.some((o) => o.value === current) ? unitNode(scope, current) : null;
  if (node) {
    let at = out.length;
    for (let i = out.length - 1; i > 0; i--) {
      if (current.startsWith(`${out[i]!.value}/`)) {
        at = i + 1;
        break;
      }
    }
    out.splice(at, 0, { value: current, label: lectureTitle(scope, node) });
  }
  return out;
}

export function unitNode(scope: DeckNode, unit: string): DeckNode | null {
  if (!unit) return null;
  let n: DeckNode | null = scope;
  for (const s of unit.split('/')) {
    n = n?.children.find((c) => c.slug === s) ?? null;
    if (!n) return null;
  }
  return n;
}

export function unitOf(scope: DeckNode, node: DeckNode): string | null {
  const parts: string[] = [];
  for (let n: DeckNode | null = node; n; n = n.parent) {
    if (n === scope) return parts.join('/');
    parts.unshift(n.slug);
  }
  return null;
}

export function scopeNodeOf(node: DeckNode): CourseDeckNode | null {
  for (let n: DeckNode | null = node; n; n = n.parent) {
    if ((n.depth === 3 || n.depth === 2) && hasPage(n)) return n;
  }
  return null;
}

export const unitDeckIds = (unit: DeckNode | null) =>
  unit ? new Set(descendants(unit).map((n) => n.id)) : null;
