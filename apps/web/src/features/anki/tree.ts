import { useMemo } from 'react';
import { deckSlugs } from '@qv/schema';
import { sortDecksByName } from '@qv/srs';
import type { AnkiTreeDeck, Catalog, CourseWithAssessments, SemesterWithCourses } from '@qv/schema';
import { paths } from '../../app/paths';
import type { DeckRef } from '../../app/paths';
import type { Crumb } from '../../ui/Breadcrumbs';
import { useCatalog } from '../catalog/queries';

/** A deck of the tree, as Anki's deck list: with its parent, its children and where its page is. */
export interface DeckNode extends AnkiTreeDeck {
  /** Last component of the name: «01 - Columna vertebral». */
  label: string;
  /** 0 = the root, 1 = a semester, 2 = a course, 3 = an assessment… */
  depth: number;
  /** Its URL segment (unique among its siblings). */
  slug: string;
  parent: DeckNode | null;
  /** By name, as in Anki. */
  children: DeckNode[];
  /**
   * Where its page and its study are; null above a course (the root and the semesters: Anki on the web
   * goes course by course, they are not studied).
   */
  ref: DeckRef | null;
  /** The semester and course it is in (for the course's page and the breadcrumbs). */
  semesterInfo: SemesterWithCourses | null;
  course: CourseWithAssessments | null;
  /** Cards directly in it (not in its subdecks). */
  ownCards: number;
}

export interface AnkiTree {
  root: DeckNode | null;
  byId: Map<string, DeckNode>;
  /** In the order of Anki's deck list: each deck right before its subdecks. */
  nodes: DeckNode[];
}

/** The catalog's deck tree with the links between the decks and their URLs. */
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

/** A deck that has a page and a study (a course's or one below it). */
export type CourseDeckNode = DeckNode & { ref: DeckRef };

export const hasPage = (node: DeckNode): node is CourseDeckNode => node.ref !== null;

/**
 * A deck's breadcrumbs, as the rest of the site: Inicio › semester › course › assessment › Anki › … › the deck.
 * The course goes to its page; the last one has no link.
 */
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
      // The course's own deck: «Anki» of the course.
      if (n === node) items.push({ label: 'Anki', to: paths.deck(n.ref) });
      continue;
    }
    items.push({ label: n.label, to: paths.deck(n.ref) });
  }
  if (last) items.push(last);
  else delete items[items.length - 1]!.to;
  return items;
}

export function useAnkiTree() {
  const catalog = useCatalog();
  const tree = useMemo(() => (catalog.data ? buildAnkiTree(catalog.data) : null), [catalog.data]);
  return { catalog, tree };
}

/** The node and every one below it, parents first. */
export function descendants(node: DeckNode): DeckNode[] {
  const out = [node];
  for (let i = 0; i < out.length; i++) out.push(...out[i]!.children);
  return out;
}

/** From the root to the node. */
export function ancestry(node: DeckNode): DeckNode[] {
  const out: DeckNode[] = [];
  for (let n: DeckNode | null = node; n; n = n.parent) out.unshift(n);
  return out;
}

/** The deck of a course (depth 2), if it has one. */
export function courseDeck(tree: AnkiTree, courseId: string): CourseDeckNode | null {
  return (
    tree.nodes.find(
      (n): n is CourseDeckNode => n.depth === 2 && hasPage(n) && n.courseId === courseId,
    ) ?? null
  );
}

/** What a deck's URL opens: its page, studying it, or its final review. */
export type DeckScreen = 'page' | 'study' | 'review';

export type Resolved =
  | { kind: 'deck'; node: CourseDeckNode; screen: DeckScreen }
  /** The URL is right but in another semester or course: to the node's canonical URL. */
  | { kind: 'moved'; node: CourseDeckNode; screen: DeckScreen }
  /** An old URL (v1.1–1.2: `…/anki/<deck>[/study|/options]?subdeck=`): where it goes now. */
  | { kind: 'legacy'; node: CourseDeckNode; what: 'page' | 'study' | 'options' }
  | { kind: 'missing' };

/**
 * The deck of a course URL (`/semesters/:n/courses/:courseId/anki/<segments…>[/study|/review]`). The segments walk
 * the tree down from the course's deck; an old URL (the deck's slug right under `anki/`, with
 * `?subdeck=`) is recognized and sent to its new place.
 */
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
  // A course that does not have it: the deck's own course, if exactly one has it (as notes and courses
  // in the wrong place go to their canonical URL).
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
  const screen: DeckScreen = tail === 'study' ? 'study' : tail === 'review' ? 'review' : 'page';
  const path = screen === 'page' ? segments : segments.slice(0, -1);
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
  // Before v1.3: one segment, the deck's slug from the last part of its name; `?subdeck=` below it.
  const last = segments.at(-1);
  const what = last === 'study' ? 'study' : last === 'options' ? 'options' : 'page';
  const old = what === 'page' ? segments : segments.slice(0, -1);
  if (old.length !== 1) return null;
  const deck = descendants(course).find((n) => n.slug === old[0]) as CourseDeckNode | undefined;
  if (!deck) return null;
  const sub = subdeck ? descendants(deck).find((n) => n.slug === subdeck) : deck;
  return { kind: 'legacy', node: (sub ?? deck) as CourseDeckNode, what };
}
