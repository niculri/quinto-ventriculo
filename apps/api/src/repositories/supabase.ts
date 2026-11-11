import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  PublishResult,
  QuizDetail,
  QuizSummary,
  ReleaseLog,
  ReleaseMark,
  RevertResult,
  SearchResult,
  Semester,
  SiteSettings,
  UnpublishedLog,
} from '@qv/schema';
import type {
  ContentRepository,
  Refused,
  ReleaseRepository,
  SiteSettingsRepository,
  UnpublishedRepository,
} from '../repository';
import { buildCatalog } from './build-catalog';
import { nonNull } from './stream';

// The header lives in the document: PostgREST takes just that key (`header:document->header`).
// `group` is a word of SQL: the key goes with another name (PostgREST quotes it, but better not to depend on that).
const SUMMARY_COLUMNS =
  'id, slug, course_id, assessment_id, kind, title, subtitle, position, updated_at, code, version, published_at, version_at, header:document->header, practice:document->practice, note_group:document->group';
const NOTE_COLUMNS =
  'id, slug, course_id, assessment_id, kind, title, subtitle, position, updated_at, code, version, published_at, version_at, document';

interface NoteRow {
  id: string;
  slug: string;
  course_id: string;
  assessment_id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  position: number;
  updated_at: string;
  code?: string | null;
  header?: unknown;
  version?: number | null;
  published_at?: string | null;
  version_at?: string | null;
  /** The summary's column (`document->practice`). */
  practice?: unknown;
  /** The summary's column (`document->group`). */
  note_group?: unknown;
  document?: {
    sources?: string[];
    html?: string;
    toc?: unknown[];
    createdOn?: string;
    header?: unknown;
    practice?: unknown;
    group?: unknown;
  };
}

const iso = (t: string) => new Date(t).toISOString();

function summary(r: NoteRow) {
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

interface DeckRow {
  id: string;
  name: string;
  parent: string | null;
  preset: string | null;
  semester: number | null;
  course_id: string | null;
  assessment_id: string | null;
  note_count: number;
  card_count: number;
  /** Step 3.2; missing before its migration. */
  own_note_count?: number;
  exclusive_note_count?: number;
  closed_note_count?: number;
}

interface NoteTypeRow {
  id: string;
  name: string;
  kind: 'normal' | 'cloze';
  occlusion: boolean;
  fields: string[];
  templates: { name: string }[];
  sort_field: number;
}

interface QuizRow {
  id: string;
  slug: string;
  course_id: string;
  assessment_id: string;
  title: string;
  position: number;
  question_count: number;
  section_count: number;
  updated_at: string;
}
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

/**
 * A function of the database called as supabase-js calls it (the same headers), but with the body of the response
 * as it comes, not parsed. In another schema than `public`, PostgREST takes it from `Content-Profile`.
 */
function rawRpcOf(url: string, serviceKey: string, schema: 'public' | 'draft' = 'public') {
  return async (fn: string, args: Record<string, unknown>) => {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(schema === 'public' ? {} : { 'Content-Profile': schema }),
      },
      body: JSON.stringify(args),
    });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => '');
      throw new Error(`Content database (${fn}): ${r.status} ${detail.slice(0, 300)}`);
    }
    return r.body;
  };
}

/**
 * Content database on Supabase, with the service key (only from the Worker, never in the browser). `schema` =
 * `draft`: the draft (step 1.7), the same reads on its mirror tables, for an administrator's preview; PostgREST has to
 * expose the schema (docs/configuracion.md).
 */
export function supabaseRepository(
  url: string,
  serviceKey: string,
  schema: 'public' | 'draft' = 'public',
): ContentRepository {
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema },
  }) as unknown as SupabaseClient;
  const rawRpc = rawRpcOf(url, serviceKey, schema);

  const unwrap = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`Content database (${what}): ${r.error.message}`);
    return r.data as T;
  };

  /**
   * Every deck of the tree, a page at a time: PostgREST gives at most 1000 rows of a set (Supabase's «Max
   * rows»), and the tree of every semester can have more decks than that.
   */
  const deckTree = async () => {
    const out: DeckRow[] = [];
    for (let from = 0; ; from += TREE_PAGE) {
      const r = await db.rpc('anki_deck_tree').range(from, from + TREE_PAGE - 1);
      if (r.error) return { data: null, error: r.error };
      const rows = (r.data ?? []) as DeckRow[];
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
      const assessments = unwrap(a, 'assessments').map(
        (x: { course_id: string; suggested_date: string | null }) =>
          Assessment.parse({ ...x, courseId: x.course_id, suggestedDate: x.suggested_date }),
      );
      const notes = unwrap(n, 'notes').map((x) => NoteSummary.parse(summary(x as NoteRow)));
      const decks = (unwrap(d, 'decks') as DeckRow[]).map((x) =>
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
          ...(x.own_note_count === undefined ? {} : { ownNoteCount: x.own_note_count }),
          ...(x.exclusive_note_count === undefined
            ? {}
            : { exclusiveNoteCount: x.exclusive_note_count }),
          ...(x.closed_note_count === undefined ? {} : { closedNoteCount: x.closed_note_count }),
        }),
      );
      const noteTypes = (unwrap(t, 'note types') as NoteTypeRow[]).map((x) =>
        NoteTypeSummary.parse({
          id: x.id,
          name: x.name,
          kind: x.kind,
          occlusion: x.occlusion,
          fields: x.fields,
          templates: x.templates.map((tm) => tm.name),
          sortField: x.sort_field,
        }),
      );
      const presets = unwrap(p, 'presets') as { name: string; config: Record<string, unknown> }[];
      const quizzes = (unwrap(z, 'quizzes') as QuizRow[]).map(quizSummary);
      // The card browser's indexes (step 3.3). A database from before that migration does not have the function: the
      // catalog goes without them (the browser says it has no index) rather than failing the whole site.
      let indexes: CardIndexRecord[] = [];
      if (x.error) console.error(`Content database (browse indexes): ${x.error.message}`);
      else indexes = ((x.data ?? []) as unknown[]).map((r) => CardIndexRecord.parse(r));
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

    async quizzes() {
      return (unwrap(await db.from('quizzes').select(QUIZ_COLUMNS), 'quizzes') as QuizRow[]).map(
        quizSummary,
      );
    },

    async quiz(id) {
      const row = unwrap(await db.rpc('quiz_detail', { quiz_id: id }), 'quiz');
      return row ? QuizDetail.parse(row) : null;
    },

    // Hundreds of questions with their SVG figures: as it comes (the API only signs its images).
    async quizSectionJson(id, sectionId) {
      return nonNull(await rawRpc('quiz_section', { quiz_id: id, section_id: sectionId }));
    },

    // These two come in the API's shape and go out as they come (the stream of the response): parsing and
    // writing several MB again would pass the CPU a Worker request has. The web validates them.
    async browseJson() {
      return rawRpc('anki_browse_notes', {});
    },

    async deckJson(id) {
      return nonNull(await rawRpc('anki_deck_detail', { deck_id: id }));
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
      const row = unwrap(r, 'note') as NoteRow | null;
      if (!row) return null;
      const doc = row.document ?? {};
      return Note.parse({
        ...summary({ ...row, header: doc.header, note_group: doc.group }),
        sources: doc.sources ?? [],
        html: doc.html ?? '',
        toc: doc.toc ?? [],
        ...(doc.createdOn ? { createdOn: doc.createdOn } : {}),
        ...(doc.practice ? { practice: doc.practice } : {}),
      });
    },

    async search(query, limit) {
      const r = await db.rpc('search_notes', { query, max_results: limit });
      const rows = unwrap(r, 'search') as {
        note_id: string;
        note_slug: string;
        note_title: string;
        course_name: string;
        anchor: string;
        section: string;
        snippet: string;
        score: number;
      }[];
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

/**
 * The release panel's reads (step 1.7, part 2): the `release_*` functions of the content database, in `public` (they
 * read the draft themselves), with the service key.
 */
export function supabaseReleaseRepository(url: string, serviceKey: string): ReleaseRepository {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const rawRpc = rawRpcOf(url, serviceKey);
  return {
    summaryJson: () => rawRpc('release_summary', {}),
    browseIndexesJson: () => rawRpc('release_browse_index_changes', {}),
    itemsJson: (assessment, kind, after) =>
      rawRpc('release_items', { assessment, kind, after_key: after, max_rows: 200 }),
    textsJson: (after) => rawRpc('release_texts', { after_key: after, max_rows: 500 }),
    async media(after, limit) {
      const r = await db.rpc('release_media', { after_key: after, max_rows: limit });
      if (r.error) throw new Error(`Content database (release_media): ${r.error.message}`);
      const data = r.data as { keys: string[]; next: string | null };
      return { keys: data.keys, next: data.next };
    },
    async setMark(fingerprint, mark, checked, by) {
      const r = await db.rpc('set_release_mark', { fingerprint, mark, checked, checked_by: by });
      if (r.error) {
        if (r.error.code === 'P0409') return 'stale';
        throw new Error(`Content database (set_release_mark): ${r.error.message}`);
      }
      return (r.data as unknown[]).map((m) => ReleaseMark.parse(m));
    },
    async publish(input) {
      const r = await db.rpc('publish_release', { p: input });
      if (r.error) return refusedOr('publish_release', r.error);
      return { ok: true, result: PublishResult.parse(r.data) };
    },
    async revert(id, by) {
      const r = await db.rpc('revert_release', { p: { id, by } });
      if (r.error) return refusedOr('revert_release', r.error);
      return { ok: true, result: RevertResult.parse(r.data) };
    },
    async log() {
      const r = await db.rpc('release_log', { max_rows: 50 });
      if (r.error) throw new Error(`Content database (release_log): ${r.error.message}`);
      return ReleaseLog.parse(r.data);
    },
  };
}

/**
 * A refusal of publish_release() or revert_release() («publish_release: marks», SQLSTATE P0409 or P0422) as its
 * reason; anything else is an error of the database.
 */
function refusedOr(
  fn: string,
  error: { code?: string; message: string; details?: string | null },
): Refused {
  const reason = new RegExp(`^${fn}: ([a-z_]+)$`).exec(error.message)?.[1];
  if (!reason || (error.code !== 'P0409' && error.code !== 'P0422')) {
    throw new Error(`Content database (${fn}): ${error.message}`);
  }
  return { ok: false, reason, detail: error.details ?? null };
}

/**
 * The site's settings (step 1.8): `site_settings()` and `set_site_settings()` of the content database, in `public`
 * (the draft does not have them), with the service key.
 */
export function supabaseSiteSettingsRepository(
  url: string,
  serviceKey: string,
): SiteSettingsRepository {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const parse = (data: unknown) => {
    const d = data as {
      hideEmptySemesters: boolean;
      updatedAt: string | null;
      updatedBy: string | null;
    };
    return SiteSettings.parse({
      ...d,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    });
  };
  return {
    async get() {
      const r = await db.rpc('site_settings');
      if (r.error) throw new Error(`Content database (site_settings): ${r.error.message}`);
      return parse(r.data);
    },
    async set({ hideEmptySemesters, by }) {
      const r = await db.rpc('set_site_settings', { p: { hideEmptySemesters, by } });
      if (r.error) throw new Error(`Content database (set_site_settings): ${r.error.message}`);
      return parse(r.data);
    },
  };
}

/**
 * The record of what was taken off the site (step 2.10): `unpublish_log_entries()` of the content database, in
 * `public`, with the service key. At most 200 entries: parsed here (it is small).
 */
export function supabaseUnpublishedRepository(
  url: string,
  serviceKey: string,
): UnpublishedRepository {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async log() {
      const r = await db.rpc('unpublish_log_entries', { max_entries: 200 });
      if (r.error) throw new Error(`Content database (unpublish_log_entries): ${r.error.message}`);
      const data = r.data as { total: number; entries: { doneAt: string }[] };
      return UnpublishedLog.parse({
        ...data,
        entries: data.entries.map((e) => ({ ...e, doneAt: new Date(e.doneAt).toISOString() })),
      });
    },
  };
}
