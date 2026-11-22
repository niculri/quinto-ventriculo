// Tests for the repository that answers as if the courses turned off did not exist.
import { describe, expect, it, vi } from 'vitest';
import type { ContentRepository } from '../../ports/content';
import { hideCourses } from '../hideCourses';

const course = (id: string) => ({ id, semester: 2, name: id, emoji: '🧬', position: 1 });

function inner() {
  const calls: string[] = [];
  const search = vi.fn(async (_query: string, _limit: number, _excluded?: readonly string[]) => []);
  const decks: Record<string, string | null> = { d1: 'oculto', d2: 'visible', raiz: null };
  const quizzes: Record<string, { id: string; courseId: string }> = {
    q1: { id: 'q1', courseId: 'oculto' },
    q2: { id: 'q2', courseId: 'visible' },
  };
  const repository = {
    courses: async () => [course('oculto'), course('visible')],
    deckCourse: async (id: string) => decks[id] ?? null,
    deckJson: async (id: string) => (calls.push(`deckJson:${id}`), `{"id":"${id}"}`),
    card: async (guid: string) => ({ noteGuid: guid, deckId: guid === 'a' ? 'd1' : 'd2' }),
    quizzes: async () => Object.values(quizzes),
    quiz: async (id: string) => quizzes[id] ?? null,
    quizSectionJson: async (id: string, s: string) => (calls.push(`section:${id}/${s}`), '{}'),
    search,
  } as unknown as ContentRepository;
  return { repository, calls, search };
}

describe('hideCourses', () => {
  it('with nothing hidden it is the same repository, not a copy that could drift', () => {
    const { repository } = inner();
    expect(hideCourses(repository, new Set())).toBe(repository);
  });

  it('the list of courses and of quizzes leaves out the hidden ones', async () => {
    const hidden = hideCourses(inner().repository, new Set(['oculto']));
    expect((await hidden.courses()).map((c) => c.id)).toEqual(['visible']);
    expect((await hidden.quizzes()).map((q) => q.id)).toEqual(['q2']);
  });

  it('the course of a deck is null when it is hidden, and a deck without a course stays', async () => {
    const hidden = hideCourses(inner().repository, new Set(['oculto']));
    expect(await hidden.deckCourse('d1')).toBeNull();
    expect(await hidden.deckCourse('d2')).toBe('visible');
    expect(await hidden.deckCourse('raiz')).toBeNull();
    expect(await hidden.deckJson('raiz')).toBe('{"id":"raiz"}');
  });

  it('a deck, a card or a quiz of a hidden course is null, and nothing big is read for it', async () => {
    const { repository, calls } = inner();
    const hidden = hideCourses(repository, new Set(['oculto']));
    expect(await hidden.deckJson('d1')).toBeNull();
    expect(await hidden.card('a', 0)).toBeNull();
    expect(await hidden.card('b', 0)).toMatchObject({ noteGuid: 'b' });
    expect(await hidden.quiz('q1')).toBeNull();
    expect(await hidden.quizSectionJson('q1', 's')).toBeNull();
    expect(await hidden.quizSectionJson('q2', 's')).toBe('{}');
    expect(await hidden.quizSectionJson('nada', 's')).toBeNull();
    expect(calls).toEqual(['section:q2/s']);
  });

  it('the search asks the database to leave the hidden courses out, whatever the caller sent', async () => {
    const { repository, search } = inner();
    await hideCourses(repository, new Set(['oculto', 'otro'])).search('ribo', 5);
    expect(search).toHaveBeenCalledWith('ribo', 5, ['oculto', 'otro']);
  });
});
