// Tests taking a piece off the site: what it asks the database, what it writes in the list and what it refuses.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportError } from '../../errors';
import type { Manifest } from '../../manifest/schemas';
import { unpublish } from '../unpublish';
import type { UnpublishResult } from '../types';

const manifest: Pick<Manifest, 'notes' | 'tests'> = {
  notes: [],
  tests: [
    {
      assessmentId: 'a/b',
      tests: [{ slug: 'practica', position: 1, folder: 'Test' }],
    },
  ],
};

const result = (over: Partial<UnpublishResult> = {}): UnpublishResult => ({
  kind: 'quiz',
  id: 'a-b-practica',
  found: true,
  title: 'Práctica',
  assessmentId: 'a/b',
  removed: { questions: 7 },
  usedBy: [],
  logId: 3,
  ...over,
});

/** A content database that answers `unpublish_content` and records every call. */
function fakeDb(answer: UnpublishResult) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    db: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        const data = fn === 'unpublish_draft' ? { found: false, removed: 0 } : answer;
        return Promise.resolve({ data, error: null });
      },
    },
  };
}

const store = { has: () => Promise.resolve(false), delete: () => Promise.resolve() };

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-unpublish-'));
});
afterAll(() => rm(folder, { recursive: true, force: true }));

const options = (listFile: string, over: object = {}) => ({
  listFile,
  manifest,
  store,
  kind: 'quiz' as const,
  id: 'practica',
  by: 'yo',
  reason: 'porque sí',
  confirm: () => Promise.resolve(true),
  now: () => new Date('2026-11-22T10:00:00Z'),
  ...over,
});

describe('unpublish', () => {
  it('without a reason it stops before asking anything', async () => {
    const { db, calls } = fakeDb(result());
    const e = await unpublish({ ...options(join(folder, 'a.json')), db, reason: ' ' }).catch(
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(ImportError);
    expect((e as ImportError).kind).toBe('usage');
    expect(calls).toEqual([]);
  });

  it('a dry run asks what would go and writes nothing', async () => {
    const { db, calls } = fakeDb(result());
    const listFile = join(folder, 'dry.json');
    const outcome = await unpublish({ ...options(listFile), db, dryRun: true });
    expect(outcome.applied).toBe(false);
    expect(calls.map((c) => [c.fn, c.args.apply])).toEqual([['unpublish_content', false]]);
    await expect(readFile(listFile)).rejects.toThrow();
  });

  it('writes the list before taking the piece off, and takes it off by its id', async () => {
    const { db, calls } = fakeDb(result());
    const listFile = join(folder, 'applied.json');
    await writeFile(listFile, JSON.stringify({ note: 'kept', items: [] }));
    const outcome = await unpublish({ ...options(listFile), db });
    expect(outcome.applied).toBe(true);
    expect(calls.map((c) => [c.fn, c.args.item, c.args.apply])).toEqual([
      ['unpublish_content', 'a-b-practica', false],
      ['unpublish_content', 'a-b-practica', true],
    ]);
    expect(JSON.parse(await readFile(listFile, 'utf8'))).toEqual({
      note: 'kept',
      items: [
        { kind: 'quiz', id: 'a-b-practica', reason: 'porque sí', date: '2026-11-22', by: 'yo' },
      ],
    });
  });

  it('if the person does not confirm, nothing is written nor taken off', async () => {
    const { db, calls } = fakeDb(result());
    const listFile = join(folder, 'no.json');
    const outcome = await unpublish({
      ...options(listFile),
      db,
      confirm: () => Promise.resolve(false),
    });
    expect(outcome.applied).toBe(false);
    expect(calls).toHaveLength(1);
    await expect(readFile(listFile)).rejects.toThrow();
  });

  it('a piece that is nowhere is an error of usage', async () => {
    const { db } = fakeDb(result({ found: false }));
    const e = await unpublish({
      ...options(join(folder, 'none.json')),
      db,
      id: 'otro',
    }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ImportError);
    expect((e as Error).message).toContain('No existe el test otro');
  });
});
