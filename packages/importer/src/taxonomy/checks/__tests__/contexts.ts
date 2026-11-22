// Small hand-made bundles and contexts for the tests of the taxonomy checks, so each rule is tried on its own.
import type { ContentBundle, TaxonomyFile, TopicMapFile } from '@qv/schema';
import type { Manifest } from '../../../manifest/schemas';
import { createContext } from '../context';
import type { TaxonomyCheck } from '../context';

export const A = 'a/1';
export const B = 'b/1';

export const deck = (
  id: string,
  name: string,
  assessmentId: string | null,
  parentId: string | null = null,
) => ({ id, name, assessmentId, parentId }) as ContentBundle['ankiDecks'][number];

export const ankiNote = (
  guid: string,
  decks: string[],
  extra: { code?: string; noteTypeId?: string } = {},
) =>
  ({
    guid,
    code: extra.code ?? null,
    noteTypeId: extra.noteTypeId ?? 't',
    cards: decks.map((deckId, ord) => ({ ord, deckId })),
  }) as unknown as ContentBundle['ankiNotes'][number];

export const quiz = (
  id: string,
  assessmentId: string,
  groups: Record<string, Record<string, string[]>>,
) =>
  ({
    id,
    assessmentId,
    sections: Object.entries(groups).map(([sid, gs]) => ({
      id: sid,
      groups: Object.entries(gs).map(([gid, questions]) => ({
        id: gid,
        questions: questions.map((q) => ({ id: q })),
      })),
    })),
  }) as unknown as ContentBundle['quizzes'][number];

export const articleOf = (id: string, sections: [anchor: string, title: string][]) =>
  ({
    id,
    toc: sections.map(([anchor, title]) => ({ anchor, title, level: 2 })),
  }) as unknown as ContentBundle['notes'][number];

interface Parts {
  decks?: ContentBundle['ankiDecks'];
  ankiNotes?: ContentBundle['ankiNotes'];
  quizzes?: ContentBundle['quizzes'];
  notes?: ContentBundle['notes'];
  /** The bundle before content/unpublished.json, when it has more than the published one. */
  before?: Partial<ContentBundle>;
  op?: Partial<TaxonomyCheck>;
  entries?: { id: string; practice?: object }[];
  history?: 'commit' | 'shallow' | 'none';
}

export function contextOf(taxonomy: TaxonomyFile, map: TopicMapFile, parts: Parts = {}) {
  const after = {
    ankiDecks: parts.decks ?? [],
    ankiNotes: parts.ankiNotes ?? [],
    ankiNoteTypes: [],
    quizzes: parts.quizzes ?? [],
    notes: parts.notes ?? [],
  } as unknown as ContentBundle;
  const manifest = {
    catalog: { semesters: [], courses: [], assessments: [] },
    notes: [
      {
        assessmentId: A,
        notes: (parts.entries ?? []).map((e) => ({ slug: e.id, kind: 'lecture', ...e })),
      },
    ],
    decks: [],
  } as unknown as Manifest;
  const op: TaxonomyCheck = {
    manifest,
    scope: null,
    before: { ...after, ...parts.before },
    after,
    notes: true,
    partialNotes: false,
    decks: true,
    tests: true,
    offNotes: new Set(),
    offQuizzes: new Set(),
    ...parts.op,
  };
  return createContext(op, {
    assessmentId: A,
    taxonomy,
    map,
    ...(parts.history ? { history: parts.history } : {}),
  });
}

export const taxonomyOf = (units: TaxonomyFile['units']): TaxonomyFile => ({
  assessmentId: A,
  version: 1,
  nextTopic: 99,
  units,
});

export const mapOf = (
  notes: TopicMapFile['notes'] = [],
  questions: TopicMapFile['questions'] = [],
): TopicMapFile => ({ assessmentId: A, taxonomyVersion: 1, notes, questions });
