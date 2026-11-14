// The catalog's Anki deck tree with parents, children and URLs, its breadcrumbs and titles, and what a deck URL opens.

import { deckSlugs } from '@qv/schema';
import { sortDecksByName } from '@qv/srs';
import type { AnkiTreeDeck, Catalog, CourseWithAssessments, SemesterWithCourses } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { DeckRef } from '../../../shared/lib/paths';
import type { Crumb } from '../../../shared/ui/Breadcrumbs';

export interface DeckNode extends AnkiTreeDeck {
  label: string;
  depth: number;
  slug: string;
  parent: DeckNode | null;
  children: DeckNode[];
  /** Null above a course: the root and the semesters are not studied on the web. */
  ref: DeckRef | null;
  semesterInfo: SemesterWithCourses | null;
  course: CourseWithAssessments | null;
  ownCards: number;
}

export interface AnkiTree {
  root: DeckNode | null;
  byId: Map<string, DeckNode>;
  nodes: DeckNode[];
}

export function buildAnkiTree(catalog: Catalog): AnkiTree {
  const slugs = deckSlugs(catalog.anki.decks);
  const semesters = new Map(catalog.semesters.map((s) => [s.number, s]));
  const courses = new Map(
    catalog.semesters.flatMap((s) => s.courses.map((c) => [c.id, c] as const)),
  );
  const byId = new Map<string, DeckNode>();
  const nodes: DeckNode[] = [];
  for (const d of sortDecksByName(catalog.anki.decks)) {
    const parent = d.parentId ? (byId.get(d.parentId) ?? null) : null;
    const depth = d.name.split('::').length - 1;
    const node: DeckNode = {
      ...d,
      label: d.name.split('::').at(-1)!,
      depth,
      slug: slugs.get(d.id)!,
      parent,
      children: [],
      ref: null,
      semesterInfo: d.semester === null ? null : (semesters.get(d.semester) ?? null),
      course: d.courseId === null ? null : (courses.get(d.courseId) ?? null),
      ownCards: d.cardCount,
    };
    node.ref = refOf(node);
    parent?.children.push(node);
    if (parent) parent.ownCards -= d.cardCount;
    byId.set(d.id, node);
    nodes.push(node);
  }
  return { root: nodes.find((n) => n.parentId === null) ?? null, byId, nodes };
}

function refOf(node: DeckNode): DeckRef | null {
  if (node.depth < 2 || node.courseId === null || node.semester === null) return null;
  const segments: string[] = [];
  let n: DeckNode | null = node;
  while (n && n.depth > 2) {
    segments.unshift(n.slug);
    n = n.parent;
  }
  return { course: { id: node.courseId, semester: node.semester }, segments };
}

export type CourseDeckNode = DeckNode & { ref: DeckRef };

export const hasPage = (node: DeckNode): node is CourseDeckNode => node.ref !== null;

export function deckCrumbs(node: CourseDeckNode, last?: Crumb): Crumb[] {
  const items: Crumb[] = [{ label: 'Inicio', to: paths.home }];
  if (node.semesterInfo) {
    items.push({ label: node.semesterInfo.name, to: paths.semester(node.semesterInfo.number) });
  }
  for (const n of ancestry(node)) {
    if (!hasPage(n)) continue;
    if (n.depth === 3 && n.course && n.assessmentId) {
      // The assessment is more than its deck: «Certamen 2» goes to its section of the course, and «Anki» to
      // its deck (the page with its decks).
      items.push({ label: n.label, to: paths.assessment(n.ref.course, n.assessmentId) });
      items.push({ label: 'Anki', to: paths.deck(n.ref) });
      continue;
    }
    if (n.depth === 2 && n.course) {
      items.push({ label: n.course.name, to: paths.course(n.ref.course) });
      if (n === node) items.push({ label: 'Anki', to: paths.deck(n.ref) });
      continue;
    }
    items.push({ label: n.label, to: paths.deck(n.ref) });
  }
  if (last) items.push(last);
  else delete items[items.length - 1]!.to;
  return items;
}

export function studyBackLabel(node: DeckNode): string {
  const course = node.course?.name ?? deckLabelAt(node, 2) ?? node.label;
  if (node.depth < 3) return course;
  const assessment =
    (node.assessmentId && node.course?.assessments.find((a) => a.id === node.assessmentId)?.name) ||
    (node.assessmentId ? deckLabelAt(node, 3) : null);
  return assessment ? `${course} · ${assessment}` : course;
}

function deckLabelAt(node: DeckNode, depth: number): string | null {
  return ancestry(node).find((n) => n.depth === depth)?.label ?? null;
}

export function descendants(node: DeckNode): DeckNode[] {
  const out = [node];
  for (let i = 0; i < out.length; i++) out.push(...out[i]!.children);
  return out;
}

export function ancestry(node: DeckNode): DeckNode[] {
  const out: DeckNode[] = [];
  for (let n: DeckNode | null = node; n; n = n.parent) out.unshift(n);
  return out;
}

export function courseDeck(tree: AnkiTree, courseId: string): CourseDeckNode | null {
  return (
    tree.nodes.find(
      (n): n is CourseDeckNode => n.depth === 2 && hasPage(n) && n.courseId === courseId,
    ) ?? null
  );
}

export type DeckScreen = 'page' | 'study' | 'review' | 'cards' | 'practice';

export type Resolved =
  | { kind: 'deck'; node: CourseDeckNode; screen: DeckScreen }
  | { kind: 'moved'; node: CourseDeckNode; screen: DeckScreen }
  | { kind: 'legacy'; node: CourseDeckNode; what: 'page' | 'study' | 'options' }
  | { kind: 'missing' };

export function resolveCourseDeck(
  tree: AnkiTree,
  semester: string,
  courseId: string,
  segments: string[],
  subdeck: string | null,
): Resolved {
  const here = courseDeck(tree, courseId);
  const found = (here && inCourse(here, semester, segments, subdeck)) ?? null;
  if (found) return found;
  const elsewhere = tree.nodes
    .filter((n): n is CourseDeckNode => n.depth === 2 && hasPage(n) && n !== here)
    .map((n) => inCourse(n, semester, segments, subdeck))
    .filter((r): r is Resolved => r !== null);
  if (elsewhere.length !== 1) return { kind: 'missing' };
  const r = elsewhere[0]!;
  return r.kind === 'deck' ? { ...r, kind: 'moved' } : r;
}

function inCourse(
  course: CourseDeckNode,
  semester: string,
  segments: string[],
  subdeck: string | null,
): Resolved | null {
  const tail = segments.at(-1);
  const practice = tail === 'practice' && segments.at(-2) === 'cards';
  const screen: DeckScreen = practice
    ? 'practice'
    : tail === 'study'
      ? 'study'
      : tail === 'review'
        ? 'review'
        : tail === 'cards'
          ? 'cards'
          : 'page';
  const path = screen === 'page' ? segments : segments.slice(0, practice ? -2 : -1);
  let node: CourseDeckNode | null = course;
  for (const s of path) {
    node = (node?.children.find((c) => c.slug === s) as CourseDeckNode | undefined) ?? null;
    if (!node) break;
  }
  if (node) {
    return String(node.semester) === semester
      ? { kind: 'deck', node, screen }
      : { kind: 'moved', node, screen };
  }
  const last = segments.at(-1);
  const what = last === 'study' ? 'study' : last === 'options' ? 'options' : 'page';
  const old = what === 'page' ? segments : segments.slice(0, -1);
  if (old.length !== 1) return null;
  const deck = descendants(course).find((n) => n.slug === old[0]) as CourseDeckNode | undefined;
  if (!deck) return null;
  const sub = subdeck ? descendants(deck).find((n) => n.slug === subdeck) : deck;
  return { kind: 'legacy', node: (sub ?? deck) as CourseDeckNode, what };
}

export const deckTitle = (n: DeckNode) => (n.depth === 2 && n.course ? n.course.name : n.label);
