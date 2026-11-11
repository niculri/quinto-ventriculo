import type { AssessmentWithNotes, Catalog } from '@qv/schema';
import type { SelectOption } from '../../ui/Select';
import { descendants, hasPage } from '../anki/tree';
import type { CourseDeckNode, DeckNode } from '../anki/tree';

/**
 * Where the cards page is: a course (every assessment of it) or an assessment. Anki goes course by course: there is no
 * page with the cards of several courses, and the scope is in the URL, never in the search's text.
 */
export interface CardsScope {
  node: CourseDeckNode;
  /** Its assessments that have cards, in the course's order. */
  assessments: AssessmentWithNotes[];
  /** Every deck of the scope (Extras included): what its progress is read by. */
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

/** The deck a card's deck goes under in the list: itself, or its parent for an «Extras». */
export function lectureOf(node: DeckNode | undefined): DeckNode | undefined {
  let n = node;
  while (n && n.label === 'Extras' && n.parent) n = n.parent;
  return n;
}

/** A lecture's title in the list: its path below the scope («S5 - SMAS… › 01 - Cavidad nasal»). */
export function lectureTitle(scope: DeckNode, lecture: DeckNode | undefined): string {
  if (!lecture) return 'Otras tarjetas';
  const parts: string[] = [];
  for (let n: DeckNode | null = lecture; n && n !== scope && n.depth > scope.depth; n = n.parent) {
    parts.unshift(n.label);
  }
  return parts.length ? parts.join(' › ') : scope.label;
}

const isExtras = (n: DeckNode) => n.label === 'Extras';
const withCards = (n: DeckNode) => n.cardCount > 0 && !isExtras(n);

/**
 * «Semana o clase»: everything, then each child of the scope (a week, a lecture; in a course, an assessment) and the
 * children of those that have their own (the lectures of a week). The value is the slugs below the scope, with «/».
 */
export function unitOptions(scope: DeckNode): SelectOption<string>[] {
  const out: SelectOption<string>[] = [
    { value: '', label: scope.depth === 2 ? 'Todo el ramo' : 'Todo el certamen' },
  ];
  for (const child of scope.children.filter(withCards)) {
    out.push({ value: child.slug, label: child.label });
    const inner = child.children.filter(withCards);
    if (inner.length < 2) continue;
    for (const g of inner) {
      out.push({ value: `${child.slug}/${g.slug}`, label: `${child.label} › ${g.label}` });
    }
  }
  return out;
}

/** The deck of a unit (its slugs below the scope); null if there is none with those slugs. */
export function unitNode(scope: DeckNode, unit: string): DeckNode | null {
  if (!unit) return null;
  let n: DeckNode | null = scope;
  for (const s of unit.split('/')) {
    n = n?.children.find((c) => c.slug === s) ?? null;
    if (!n) return null;
  }
  return n;
}

/** The slugs of a deck below the scope (its unit), or null if it is not below it. */
export function unitOf(scope: DeckNode, node: DeckNode): string | null {
  const parts: string[] = [];
  for (let n: DeckNode | null = node; n; n = n.parent) {
    if (n === scope) return parts.join('/');
    parts.unshift(n.slug);
  }
  return null;
}

/** The scope of a deck below a course: its assessment's, or the course's for one directly in it. */
export function scopeNodeOf(node: DeckNode): CourseDeckNode | null {
  for (let n: DeckNode | null = node; n; n = n.parent) {
    if ((n.depth === 3 || n.depth === 2) && hasPage(n)) return n;
  }
  return null;
}

export const unitDeckIds = (unit: DeckNode | null) =>
  unit ? new Set(descendants(unit).map((n) => n.id)) : null;
