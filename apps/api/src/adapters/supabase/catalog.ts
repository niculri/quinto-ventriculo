// The catalog of the content database: the semesters, courses, assessments, notes, tests, decks and card indexes,
// read in one go and nested.
import type { Database } from '@qv/db-types/content';
import {
  AnkiTreeDeck,
  Assessment,
  CardIndexRecord,
  Course,
  NoteSummary,
  NoteTypeSummary,
  Semester,
} from '@qv/schema';
import type { Catalog } from '@qv/schema';
import { CONTENT_RPC, NoteTypeTemplates, PresetRows } from '@qv/schema/content';
import { buildCatalog } from '../../services/build-catalog';
import type { SchemaClient } from './client';
import { fromDatabase } from './json';
import { QUIZ_COLUMNS, SUMMARY_COLUMNS, quizSummary, summary } from './summaries';
import { unwrap } from './unwrap';

type DeckRow = Database['public']['Functions']['anki_deck_tree']['Returns'][number];

const TREE_PAGE = 1000;

/** A function that returns nothing may answer `null` instead of an empty set. */
const rowsOf = (data: DeckRow[] | null): DeckRow[] => data ?? [];

/** Paged: PostgREST gives at most 1000 rows of a set, and the tree can have more decks. */
async function deckTree(db: SchemaClient) {
  const out: DeckRow[] = [];
  for (let from = 0; ; from += TREE_PAGE) {
    const r = await db.rpc('anki_deck_tree').range(from, from + TREE_PAGE - 1);
    if (r.error) return { data: null, error: r.error };
    const rows = rowsOf(r.data);
    out.push(...rows);
    if (rows.length < TREE_PAGE) return { data: out, error: null };
  }
}

/** A content database before the migration of the last three counts does not send them. */
const optionalCounts = (
  x: Partial<Pick<DeckRow, 'own_note_count' | 'exclusive_note_count' | 'closed_note_count'>>,
) => ({
  ...(x.own_note_count === undefined ? {} : { ownNoteCount: x.own_note_count }),
  ...(x.exclusive_note_count === undefined ? {} : { exclusiveNoteCount: x.exclusive_note_count }),
  ...(x.closed_note_count === undefined ? {} : { closedNoteCount: x.closed_note_count }),
});

const deckOf = (x: DeckRow) =>
  AnkiTreeDeck.parse({
    id: x.id,
    name: x.name,
    parentId: x.parent,
    preset: x.preset,
    semester: x.semester,
    courseId: x.course_id,
    assessmentId: x.assessment_id,
    noteCount: x.note_count,
    cardCount: x.card_count,
    ...optionalCounts(x),
  });

export async function readCatalog(db: SchemaClient): Promise<Catalog> {
  const [s, c, a, n, d, p, t, z, x] = await Promise.all([
    db.from('semesters').select('number, name'),
    db.from('courses').select('id, semester, name, emoji, position'),
    db.from('assessments').select('id, course_id, name, position, suggested_date'),
    db.from('notes').select(SUMMARY_COLUMNS),
    deckTree(db),
    db.from('anki_presets').select('name, config'),
    db.from('anki_note_types').select('id, name, kind, occlusion, fields, templates, sort_field'),
    db.from('quizzes').select(QUIZ_COLUMNS),
    db.rpc('anki_browse_indexes'),
  ]);
  const semesters = unwrap(s, 'semesters').map((x) => Semester.parse(x));
  const courses = unwrap(c, 'courses').map((x) => Course.parse(x));
  const assessments = unwrap(a, 'assessments').map((x) =>
    Assessment.parse({ ...x, courseId: x.course_id, suggestedDate: x.suggested_date }),
  );
  const notes = unwrap(n, 'notes').map((x) => NoteSummary.parse(summary(x)));
  const decks = unwrap<DeckRow[]>(d, 'decks').map(deckOf);
  const noteTypes = unwrap(t, 'note types').map((x) =>
    NoteTypeSummary.parse({
      id: x.id,
      name: x.name,
      kind: x.kind,
      occlusion: x.occlusion,
      fields: x.fields,
      templates: fromDatabase('anki_note_types', NoteTypeTemplates, x.templates).map(
        (tm) => tm.name,
      ),
      sortField: x.sort_field,
    }),
  );
  const presets = fromDatabase('anki_presets', PresetRows, unwrap(p, 'presets'));
  const quizzes = unwrap(z, 'quizzes').map(quizSummary);
  // A database before that migration lacks the function: the catalog goes without indexes rather than failing.
  let indexes: CardIndexRecord[] = [];
  if (x.error) console.error(`Content database (browse indexes): ${x.error.message}`);
  else {
    indexes = fromDatabase(
      'anki_browse_indexes',
      CONTENT_RPC.anki_browse_indexes.returns,
      x.data ?? [],
    ).map((r) => CardIndexRecord.parse(r));
  }
  return buildCatalog(
    semesters,
    courses,
    assessments,
    notes,
    { decks, presets, noteTypes },
    quizzes,
    indexes,
  );
}
