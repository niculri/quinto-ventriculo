// The content database on Supabase, read with the service key (only from the Worker, never in the browser).
import { CardChanges, CardDetail, Course, Note, QuizDetail, SearchResult } from '@qv/schema';
import { NoteDocument } from '@qv/schema/content';
import type { ContentRepository } from '../../ports/content';
import { readCatalog } from './catalog';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromDatabase } from './json';
import { rawRpcOf } from './raw-rpc';
import { nonNull } from './stream';
import { NOTE_COLUMNS, QUIZ_COLUMNS, quizSummary, summary } from './summaries';
import { unwrap } from './unwrap';

/** `draft`: the same reads on the draft's mirror tables, for the preview. */
export function supabaseRepository(
  url: string,
  serviceKey: string,
  schema: 'public' | 'draft' = 'public',
  client: ContentClient = contentClient(url, serviceKey),
): ContentRepository {
  const db = client.schema(schema);
  const rawRpc = rawRpcOf(url, serviceKey, schema);

  return {
    catalog: () => readCatalog(db),

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
