// The content database on Supabase, read with the service key (only from the Worker, never in the browser).
import type { Database } from '@qv/db-types/content';
import {
  AnkiTreeDeck,
  Assessment,
  CardIndexRecord,
  CardChanges,
  CardDetail,
  Course,
  Note,
  NoteSummary,
  NoteTypeSummary,
  QuizDetail,
  QuizSummary,
  SearchResult,
  Semester,
} from '@qv/schema';
import { CONTENT_RPC, NoteDocument, NoteTypeTemplates, PresetRows } from '@qv/schema/content';
import type { ContentRepository } from '../../repository';
import { buildCatalog } from '../build-catalog';
import { nonNull } from '../stream';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromDatabase } from './json';
import { rawRpcOf } from './raw-rpc';

type Tables = Database['public']['Tables'];
type Functions = Database['public']['Functions'];

// `group` is an SQL keyword, so it is renamed rather than relying on PostgREST quoting it.
const SUMMARY_COLUMNS =
  'id, slug, course_id, assessment_id, kind, title, subtitle, position, updated_at, code, version, published_at, version_at, header:document->header, practice:document->practice, note_group:document->group';
const NOTE_COLUMNS =
  'id, slug, course_id, assessment_id, kind, title, subtitle, position, updated_at, code, version, published_at, version_at, document';

/** The columns of a note's summary, with what its `document` adds. */
type NoteSummaryRow = Omit<Tables['notes']['Row'], 'document' | 'hash' | 'version_hash'> & {
  header?: unknown;
  practice?: unknown;
  note_group?: unknown;
};

const iso = (t: string) => new Date(t).toISOString();

function summary(r: NoteSummaryRow) {
  return {
    id: r.id,
    slug: r.slug,
    courseId: r.course_id,
    assessmentId: r.assessment_id,
    kind: r.kind,
    title: r.title,
    ...(r.subtitle ? { subtitle: r.subtitle } : {}),
    position: r.position,
    updatedAt: iso(r.updated_at),
    ...(r.code ? { code: r.code } : {}),
    ...(r.header ? { header: r.header } : {}),
    ...(r.version ? { version: r.version } : {}),
    ...(r.published_at ? { publishedAt: iso(r.published_at) } : {}),
    ...(r.version_at ? { versionAt: iso(r.version_at) } : {}),
    ...(r.practice ? { practice: r.practice } : {}),
    ...(r.note_group ? { group: r.note_group } : {}),
  };
}

type DeckRow = Functions['anki_deck_tree']['Returns'][number];
type QuizRow = Omit<Tables['quizzes']['Row'], 'document' | 'hash'>;
const QUIZ_COLUMNS =
  'id, slug, course_id, assessment_id, title, position, question_count, section_count, updated_at';

function quizSummary(r: QuizRow): QuizSummary {
  return QuizSummary.parse({
    id: r.id,
    slug: r.slug,
    courseId: r.course_id,
    assessmentId: r.assessment_id,
    title: r.title,
    position: r.position,
    questionCount: r.question_count,
    sectionCount: r.section_count,
    updatedAt: new Date(r.updated_at).toISOString(),
  });
}

const TREE_PAGE = 1000;

/** `draft`: the same reads on the draft's mirror tables, for the preview. */
export function supabaseRepository(
  url: string,
  serviceKey: string,
  schema: 'public' | 'draft' = 'public',
  client: ContentClient = contentClient(url, serviceKey),
): ContentRepository {
  const db = client.schema(schema);
  const rawRpc = rawRpcOf(url, serviceKey, schema);

  const unwrap = <T>(
    r: { data: T; error: null } | { data: null; error: { message: string } },
    what: string,
  ): T => {
    if (r.error) throw new Error(`Content database (${what}): ${r.error.message}`);
    return r.data;
  };

  /** Paged: PostgREST gives at most 1000 rows of a set, and the tree can have more decks. */
  const deckTree = async () => {
    const out: DeckRow[] = [];
    for (let from = 0; ; from += TREE_PAGE) {
      const r = await db.rpc('anki_deck_tree').range(from, from + TREE_PAGE - 1);
      if (r.error) return { data: null, error: r.error };
      const rows = r.data ?? [];
      out.push(...rows);
      if (rows.length < TREE_PAGE) return { data: out, error: null };
    }
  };

  return {
    async catalog() {
      const [s, c, a, n, d, p, t, z, x] = await Promise.all([
        db.from('semesters').select('number, name'),
        db.from('courses').select('id, semester, name, emoji, position'),
        db.from('assessments').select('id, course_id, name, position, suggested_date'),
        db.from('notes').select(SUMMARY_COLUMNS),
        deckTree(),
        db.from('anki_presets').select('name, config'),
        db
          .from('anki_note_types')
          .select('id, name, kind, occlusion, fields, templates, sort_field'),
        db.from('quizzes').select(QUIZ_COLUMNS),
        db.rpc('anki_browse_indexes'),
      ]);
      const semesters = unwrap(s, 'semesters').map((x) => Semester.parse(x));
      const courses = unwrap(c, 'courses').map((x) => Course.parse(x));
      const assessments = unwrap(a, 'assessments').map((x) =>
        Assessment.parse({ ...x, courseId: x.course_id, suggestedDate: x.suggested_date }),
      );
      const notes = unwrap(n, 'notes').map((x) => NoteSummary.parse(summary(x)));
      const decks = unwrap<DeckRow[]>(d, 'decks').map((x) =>
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
          // A content database before their migration does not send these three.
          ...(x.own_note_count === undefined ? {} : { ownNoteCount: x.own_note_count }),
          ...(x.exclusive_note_count === undefined
            ? {}
            : { exclusiveNoteCount: x.exclusive_note_count }),
          ...(x.closed_note_count === undefined ? {} : { closedNoteCount: x.closed_note_count }),
        }),
      );
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
    },

    async courses() {
      const r = await db.from('courses').select('id, semester, name, emoji, position');
      return unwrap(r, 'courses').map((x) => Course.parse(x));
    },

    async deckCourse(id) {
      const r = await db.from('anki_decks').select('course_id').eq('id', id).maybeSingle();
      return unwrap(r, 'deck course')?.course_id ?? null;
    },

    async quizzes() {
      return unwrap(await db.from('quizzes').select(QUIZ_COLUMNS), 'quizzes').map(quizSummary);
    },

    async quiz(id) {
      const row = unwrap(await db.rpc('quiz_detail', { quiz_id: id }), 'quiz');
      return row ? QuizDetail.parse(row) : null;
    },

    async quizSectionJson(id, sectionId) {
      return nonNull(await rawRpc('quiz_section', { quiz_id: id, section_id: sectionId }));
    },

    // The root and the semester decks have no course: the web has no page for them and the root alone is every card.
    async deckJson(id) {
      const [level, body] = await Promise.all([
        db.from('anki_decks').select('course_id').eq('id', id).maybeSingle(),
        rawRpc('anki_deck_detail', { deck_id: id }),
      ]);
      if (level.error) {
        await body.cancel();
        throw new Error(`Content database (deck level): ${level.error.message}`);
      }
      if (!level.data?.course_id) {
        await body.cancel();
        return null;
      }
      return nonNull(body);
    },

    async cardChanges(since, limit) {
      const r = await db.rpc('anki_card_changes_since', { since, max_rows: limit });
      return CardChanges.parse(unwrap(r, 'card changes'));
    },

    async card(noteGuid, ord) {
      const r = await db.rpc('anki_card', { note_guid: noteGuid, card_ord: ord });
      const row = unwrap(r, 'card');
      return row ? CardDetail.parse(row) : null;
    },

    async note(slug) {
      const r = await db.from('notes').select(NOTE_COLUMNS).eq('slug', slug).maybeSingle();
      const row = unwrap(r, 'note');
      if (!row) return null;
      const doc = fromDatabase('notes', NoteDocument, row.document) ?? {};
      return Note.parse({
        ...summary({ ...row, header: doc.header, note_group: doc.group }),
        sources: doc.sources ?? [],
        html: doc.html ?? '',
        toc: doc.toc ?? [],
        ...(doc.createdOn ? { createdOn: doc.createdOn } : {}),
        ...(doc.practice ? { practice: doc.practice } : {}),
      });
    },

    async search(query, limit, excluded = []) {
      // The call that does not name courses is the one a database before the switch for courses has.
      const r = excluded.length
        ? await db.rpc('search_notes_except', {
            query,
            max_results: limit,
            excluded_courses: [...excluded],
          })
        : await db.rpc('search_notes', { query, max_results: limit });
      const rows = unwrap(r, 'search');
      return rows.map((row) =>
        SearchResult.parse({
          noteId: row.note_id,
          noteSlug: row.note_slug,
          noteTitle: row.note_title,
          courseName: row.course_name,
          anchor: row.anchor,
          section: row.section,
          snippet: row.snippet,
          score: row.score,
        }),
      );
    },
  };
}
