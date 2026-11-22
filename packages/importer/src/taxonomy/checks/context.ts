// What the checks of one assessment share: its tree and map, the notes it lists, and what they find.
import type { ContentBundle, TaxonomyTopic, TaxonomyUnit } from '@qv/schema';
import type { Manifest, NoteEntry } from '../../manifest/schemas';
import { Problems } from '../problems';
import type { AssessmentTaxonomy } from '../types';

export interface TaxonomyCheck {
  manifest: Manifest;
  scope: Set<string> | null;
  /** The bundle before and after content/unpublished.json: what only `before` has is off the site. */
  before: ContentBundle;
  after: ContentBundle;
  notes: boolean;
  partialNotes: boolean;
  decks: boolean;
  tests: boolean;
  offNotes: ReadonlySet<string>;
  offQuizzes: ReadonlySet<string>;
}

type Toc = ContentBundle['notes'][number]['toc'];

export interface CheckContext extends AssessmentTaxonomy {
  op: TaxonomyCheck;
  problems: Problems;
  notices: string[];
  unchecked: string[];
  topics: Map<string, TaxonomyTopic>;
  unitOfTopic: Map<string, string>;
  entries: Map<string, NoteEntry>;
  /** The `##` titles of each published note. */
  toc: Map<string, Toc>;
  /** The unit and topic of every item that passed the checks, for the notices. */
  counted: { unit: string; topic: string }[];
}

export function createContext(op: TaxonomyCheck, found: AssessmentTaxonomy): CheckContext {
  const topics = new Map<string, TaxonomyTopic>();
  const unitOfTopic = new Map<string, string>();
  for (const u of found.taxonomy.units) {
    for (const x of u.topics) {
      topics.set(x.id, x);
      unitOfTopic.set(x.id, u.id);
    }
  }
  const unchecked: string[] = [];
  if (found.history === 'none') unchecked.push('ids reutilizados (sin commit con qué comparar)');
  if (found.history === 'shallow')
    unchecked.push('ids reutilizados contra el historial completo (clon superficial)');
  return {
    ...found,
    op,
    problems: new Problems(),
    notices: [],
    unchecked,
    topics,
    unitOfTopic,
    entries: new Map<string, NoteEntry>(
      op.manifest.notes
        .filter((m) => m.assessmentId === found.assessmentId)
        .flatMap((m) => m.notes.map((n) => [n.id, n] as const)),
    ),
    toc: new Map(op.after.notes.map((n) => [n.id, n.toc.filter((e) => e.level === 2)])),
    counted: [],
  };
}

export function labelOf(ctx: CheckContext, id: string): string {
  const x = ctx.topics.get(id);
  return x ? `${id} «${x.title}»` : id;
}

export const unitNotes = (u: TaxonomyUnit) => u.notes ?? [];

export function noteOfTopic(u: TaxonomyUnit, x: TaxonomyTopic): string | undefined {
  return x.note ?? (unitNotes(u).length === 1 ? unitNotes(u)[0] : undefined);
}
