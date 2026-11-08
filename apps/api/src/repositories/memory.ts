import { HIGHLIGHT_END, HIGHLIGHT_START } from '@qv/schema';
import { quizDetail, quizSummary } from '@qv/schema';
import type { ContentBundle, Note, SearchResult } from '@qv/schema';
import type { ContentRepository } from '../repository';
import { buildCatalog } from './build-catalog';
import { memoryDecks } from './memory-decks';

/**
 * In-memory repository built from the importer bundle (`.output/content.json`). For local development and
 * tests; the search mimics Postgres' (no accents, by prefix, every word).
 */
export function memoryRepository(bundle: ContentBundle): ContentRepository {
  const summaries = bundle.notes.map(
    ({
      html: _h,
      toc: _t,
      sources: _s,
      createdOn: _c,
      sections: _se,
      hash: _ha,
      versionHash: _vh,
      media: _m,
      ...r
    }) => r,
  );
  const courses = new Map(bundle.courses.map((c) => [c.id, c]));
  const decks = memoryDecks(bundle);

  return {
    async catalog() {
      return buildCatalog(
        bundle.semesters,
        bundle.courses,
        bundle.assessments,
        summaries,
        decks.tree(),
        bundle.quizzes.map(quizSummary),
      );
    },

    async quizzes() {
      return bundle.quizzes.map(quizSummary);
    },

    async quiz(id) {
      const q = bundle.quizzes.find((x) => x.id === id);
      return q ? quizDetail(q) : null;
    },

    async quizSectionJson(id, sectionId) {
      const q = bundle.quizzes.find((x) => x.id === id);
      const s = q?.sections.find((x) => x.id === sectionId);
      if (!q || !s) return null;
      return JSON.stringify({
        quizId: q.id,
        sectionId: s.id,
        groups: s.groups,
      });
    },

    async browseJson() {
      return JSON.stringify(decks.browse());
    },

    async deckJson(id) {
      const deck = decks.deck(id);
      return deck ? JSON.stringify(deck) : null;
    },

    async card(noteGuid, ord) {
      return decks.card(noteGuid, ord);
    },

    // A bundle is one import: it knows nothing of what moved before it.
    async cardChanges(since) {
      return { changes: [], next: since, latest: 0, more: false };
    },

    async note(slug) {
      const n = bundle.notes.find((x) => x.slug === slug);
      if (!n) return null;
      const { sections: _s, hash: _h, versionHash: _v, media: _m, ...note } = n;
      return note satisfies Note;
    },

    async search(query, limit) {
      const words = normalize(query)
        .split(/\s+/)
        .filter((w) => w.length > 1);
      if (!words.length) return [];
      const results: SearchResult[] = [];
      for (const n of bundle.notes) {
        n.sections.forEach((s) => {
          const title = normalize(s.title);
          const text = normalize(s.text);
          const all = `${title} ${text}`;
          if (!words.every((w) => containsPrefix(all, w))) return;
          const score = words.reduce((t, w) => t + (containsPrefix(title, w) ? 1 : 0.1), 0);
          results.push({
            noteId: n.id,
            noteSlug: n.slug,
            noteTitle: n.title,
            courseName: courses.get(n.courseId)?.name ?? '',
            anchor: s.anchor,
            section: s.title,
            snippet: snippet(s.text, words),
            score,
          });
        });
      }
      return results.sort((x, y) => y.score - x.score).slice(0, limit);
    },
  };
}

function normalize(t: string): string {
  return t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function containsPrefix(text: string, word: string): boolean {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(word)}`, 'u').test(text);
}

function escapeRegExp(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ~30 words around the first match, with the matches highlighted. */
function snippet(text: string, words: string[]): string {
  const tokens = text.split(/\s+/);
  const matches = (t: string) =>
    words.some((w) =>
      normalize(t)
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .startsWith(w),
    );
  const first = Math.max(0, tokens.findIndex(matches));
  const from = Math.max(0, first - 10);
  const piece = tokens
    .slice(from, from + 30)
    .map((t) => (matches(t) ? `${HIGHLIGHT_START}${t}${HIGHLIGHT_END}` : t));
  return `${from > 0 ? '… ' : ''}${piece.join(' ')}${from + 30 < tokens.length ? ' …' : ''}`;
}
