// Made-up pieces for the decks tests: a deck of the catalog tree, built by hand under its parent.
import type { CourseDeckNode, DeckNode } from '../features/catalog/model/tree';

/** A deck under `parent`, named by its last part like Anki («A::B::C»), with a page of its own. */
export function deckNode(
  id: string,
  label: string,
  parent: DeckNode | null,
  preset = 'Default',
): CourseDeckNode {
  const name = parent ? `${parent.name}::${label}` : label;
  const node: CourseDeckNode = {
    id,
    name,
    parentId: parent?.id ?? null,
    preset,
    semester: 1,
    courseId: 'ramo',
    assessmentId: null,
    noteCount: 1,
    cardCount: 1,
    label,
    depth: name.split('::').length - 1,
    slug: id,
    parent,
    children: [],
    ref: { course: { id: 'ramo', semester: 1 }, segments: [id] },
    semesterInfo: null,
    course: null,
    ownCards: 1,
  };
  parent?.children.push(node);
  return node;
}
