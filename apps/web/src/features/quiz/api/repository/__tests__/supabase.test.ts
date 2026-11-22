// Tests the test progress read from and saved to the users database: the rows as the app's, and each failure in words.
import { describe, expect, it } from 'vitest';
import { OPEN_ROUNDS } from '../model';
import { supabaseQuizRepository } from '../supabase';

type Result = { data: unknown; error: { message: string } | null };

function fakeClient(result: Result) {
  const calls: unknown[][] = [];
  const query = {
    select: (...a: unknown[]) => (calls.push(['select', ...a]), query),
    eq: (...a: unknown[]) => (
      calls.push(['eq', ...a]), Object.assign(Promise.resolve(result), query)
    ),
    gt: (...a: unknown[]) => (calls.push(['gt', ...a]), query),
    order: (...a: unknown[]) => (calls.push(['order', ...a]), query),
    limit: async (...a: unknown[]) => (calls.push(['limit', ...a]), result),
  };
  const client = {
    from: (table: string) => (calls.push(['from', table]), query),
    rpc: async (fn: string, args: unknown) => (calls.push(['rpc', fn, args]), result),
  };
  return { client: client as unknown as Parameters<typeof supabaseQuizRepository>[0], calls };
}

describe('supabaseQuizRepository', () => {
  it('reads a test’s sections from its rows', async () => {
    const { client, calls } = fakeClient({
      data: [
        { section_id: 's', preferences: { groups: ['01'] }, round: { id: 'r' }, updated_at: 't' },
      ],
      error: null,
    });
    expect(await supabaseQuizRepository(client).load('q')).toEqual({
      s: { preferences: { groups: ['01'] }, round: { id: 'r' }, updatedAt: 't' },
    });
    expect(calls).toContainEqual(['eq', 'quiz_id', 'q']);
  });

  it('no rows is no progress', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await supabaseQuizRepository(client).load('q')).toEqual({});
    expect(await supabaseQuizRepository(client).openRounds()).toEqual([]);
  });

  it('saves a step whole through save_quiz_progress()', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await supabaseQuizRepository(client).save({ quizId: 'q', sectionId: 's', round: null });
    expect(calls).toEqual([
      ['rpc', 'save_quiz_progress', { p: { quizId: 'q', sectionId: 's', round: null } }],
    ]);
  });

  it('the open rounds: active, with an answer, the latest first, as the app names them', async () => {
    const { client, calls } = fakeClient({
      data: [{ quiz_id: 'q', section_id: 's', answered: 2, question_count: 9, updated_at: 't' }],
      error: null,
    });
    expect(await supabaseQuizRepository(client).openRounds()).toEqual([
      { quizId: 'q', sectionId: 's', answered: 2, questionCount: 9, updatedAt: 't' },
    ]);
    expect(calls.slice(1)).toEqual([
      ['select', 'quiz_id, section_id, answered, question_count, updated_at'],
      ['eq', 'status', 'active'],
      ['gt', 'answered', 0],
      ['order', 'updated_at', { ascending: false }],
      ['limit', OPEN_ROUNDS],
    ]);
  });

  it.each([
    ['load', 'No se pudo leer tu avance (caída).'],
    ['save', 'No se pudo guardar tu avance (caída).'],
    ['openRounds', 'No se pudo leer tus tests (caída).'],
  ] as const)('a failure of %s says what could not be done and why', async (what, message) => {
    const { client } = fakeClient({ data: null, error: { message: 'caída' } });
    const repo = supabaseQuizRepository(client);
    const run = () =>
      what === 'save'
        ? repo.save({ quizId: 'q', sectionId: 's', round: null })
        : what === 'load'
          ? repo.load('q')
          : repo.openRounds();
    await expect(run()).rejects.toThrow(message);
  });
});
