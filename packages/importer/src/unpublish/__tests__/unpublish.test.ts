// Tests taking a piece off the site: what it asks the database, what it writes in the list and what it refuses.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportError } from '../../ImportError';
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

describe('unpublish: what it asks, what it removes besides rows and what it refuses', () => {
  type Answer = { data?: unknown; error?: { message: string } | null };
  /** A database that answers each function with `answers[fn]` (or `base`, or the default) and records the calls. */
  function database(answers: Record<string, Answer | ((args: Record<string, unknown>) => Answer)>) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      db: {
        rpc: (fn: string, args: Record<string, unknown>) => {
          calls.push({ fn, args });
          const a = answers[fn];
          const fallback =
            fn === 'unpublish_draft' ? { data: { found: false, removed: 0 } } : { data: null };
          const answer: Answer = typeof a === 'function' ? a(args) : (a ?? fallback);
          return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
        },
      },
    };
  }
  const storeOf = (keys: string[] = [], prefixed = true) => {
    const log: string[] = [];
    return {
      log,
      store: {
        has: (k: string) => Promise.resolve(keys.includes(k)),
        delete: (k: string) => {
          log.push(`delete ${k}`);
          return Promise.resolve();
        },
        ...(prefixed
          ? {
              deletePrefix: (p: string) => {
                log.push(`prefix ${p}`);
                return Promise.resolve(3);
              },
            }
          : {}),
      },
    };
  };
  const run = (listFile: string, db: object, over: object = {}) =>
    unpublish({ ...options(listFile), db, ...over } as Parameters<typeof unpublish>[0]);
  const file = (name: string) => join(folder, `${name}.json`);
  const KEY = `cards/${'a'.repeat(32)}.webp`;
  const THUMB = `cards/thumb/${'a'.repeat(32)}.webp`;

  it('an error of the database is an error of the cloud that names the function', async () => {
    const { db } = database({ unpublish_content: { error: { message: 'boom' } } });
    const e = await run(file('err'), db).catch((x: unknown) => x);
    expect((e as ImportError).kind).toBe('cloud');
    expect((e as Error).message).toBe('unpublish_content: boom');
  });

  it('an id that cannot be one is refused before asking anything; a deck may be named by its name', async () => {
    const { db, calls } = database({
      unpublish_content: { data: result({ kind: 'deck', found: false }) },
    });
    await expect(run(file('bad'), db, { id: 'Con Espacio!' })).rejects.toThrow(
      'No es un id de quiz válido: Con Espacio!',
    );
    expect(calls).toEqual([]);
    const e = await run(file('bad'), db, { kind: 'deck', id: 'Raíz::Mazo' }).catch(
      (x: unknown) => x,
    );
    expect((e as Error).message).toContain('No existe el mazo Raíz::Mazo');
    expect((e as Error).message).not.toContain('ni en el manifiesto');
  });

  it('a note or a test that is nowhere says it is not in the manifest either', async () => {
    const { db } = database({ unpublish_content: { data: result({ found: false }) } });
    const e = await run(file('nowhere'), db, { id: 'otra-cosa' }).catch((x: unknown) => x);
    expect((e as Error).message).toBe(
      'No existe el test otra-cosa: no está publicado ni en el manifiesto. Revisa el id.',
    );
  });

  it('a piece of the manifest that was never published is listed, with a note saying so, and leaves the draft', async () => {
    const { db, calls } = database({
      unpublish_content: { data: result({ found: false, id: 'a-b-practica' }) },
      unpublish_draft: { data: { found: true, removed: 2 } },
    });
    const lines: string[] = [];
    const listFile = file('never');
    const outcome = await run(listFile, db, { log: (l: string) => lines.push(l) });
    expect(outcome.applied).toBe(true);
    expect(lines.join('\n')).toContain('No está publicado: queda en la lista');
    expect(lines).toContain('el test a-b-practica también salió del borrador.');
    expect(calls.map((c) => c.fn)).toEqual([
      'unpublish_content',
      'unpublish_content',
      'unpublish_draft',
    ]);
    expect(outcome.draft).toEqual({ found: true, removed: 2 });
    expect(
      (JSON.parse(await readFile(listFile, 'utf8')) as { items: unknown[] }).items[0],
    ).toMatchObject({
      id: 'a-b-practica',
    });
  });

  it('a piece that is already in the list and no longer on the site only leaves the draft', async () => {
    const listFile = file('already');
    await writeFile(
      listFile,
      JSON.stringify({
        items: [{ kind: 'quiz', id: 'a-b-practica', reason: 'antes', date: '2026-11-01' }],
      }),
    );
    const { db, calls } = database({
      unpublish_content: { data: result({ found: false }) },
      unpublish_draft: { error: { message: 'sin permiso' } },
    });
    const lines: string[] = [];
    const outcome = await run(listFile, db, { log: (l: string) => lines.push(l) });
    expect(outcome).toMatchObject({ applied: false, alreadyListed: true, draft: null });
    expect(lines[0]).toBe(
      'el test a-b-practica ya estaba fuera del sitio y en content/unpublished.json.',
    );
    expect(lines).toContain('No se pudo revisar el borrador (unpublish_draft: sin permiso).');
    expect(calls.map((c) => c.fn)).toEqual(['unpublish_content', 'unpublish_draft']);
    expect(
      (JSON.parse(await readFile(listFile, 'utf8')) as { items: unknown[] }).items,
    ).toHaveLength(1);
    const dry = database({ unpublish_content: { data: result({ found: false }) } });
    await run(listFile, dry.db, { dryRun: true });
    expect(dry.calls.map((c) => c.fn)).toEqual(['unpublish_content']);
  });

  it('a deck that is already off also clears the draft’s index files, only for assessments that look like one', async () => {
    const listFile = file('deck-already');
    await writeFile(
      listFile,
      JSON.stringify({ items: [{ kind: 'deck', id: '123', reason: 'antes', date: '2026-11-01' }] }),
    );
    const { db, calls } = database({
      unpublish_content: { data: result({ kind: 'deck', id: '123', found: false }) },
      unpublish_draft_browse_indexes: { data: ['a-1/c-2', '../raro', 'sin-barra'] },
      unpublish_draft: { data: { found: false, removed: 0 } },
    });
    const { store, log } = storeOf();
    const outcome = await run(listFile, db, { kind: 'deck', id: '123', store });
    expect(log).toEqual(['prefix browse/a-1/c-2/']);
    expect(outcome.indexFiles).toBeUndefined();
    expect(outcome.calls).toEqual({ db: 3, store: 1 });
    expect(calls.map((c) => c.fn)).toEqual([
      'unpublish_content',
      'unpublish_draft_browse_indexes',
      'unpublish_draft',
    ]);
  });

  it('if the draft’s indexes cannot be read it says so and goes on; with no index answer or no store support, it skips them', async () => {
    const listFile = file('deck-index-error');
    await writeFile(
      listFile,
      JSON.stringify({ items: [{ kind: 'deck', id: '123', reason: 'antes', date: '2026-11-01' }] }),
    );
    const failing = database({
      unpublish_content: { data: result({ kind: 'deck', id: '123', found: false }) },
      unpublish_draft_browse_indexes: { error: { message: 'no existe' } },
      unpublish_draft: { data: { found: false, removed: 0 } },
    });
    const lines: string[] = [];
    await run(listFile, failing.db, { kind: 'deck', id: '123', log: (l: string) => lines.push(l) });
    expect(lines).toContain('No se pudieron revisar los índices del borrador (no existe).');
    const none = database({
      unpublish_content: { data: result({ kind: 'deck', id: '123', found: false }) },
      unpublish_draft_browse_indexes: { data: ['a/b'] },
      unpublish_draft: { data: { found: false, removed: 0 } },
    });
    const noPrefix = storeOf([], false);
    expect(
      (await run(listFile, none.db, { kind: 'deck', id: '123', store: noPrefix.store })).calls
        .store,
    ).toBe(0);
    const empty = database({
      unpublish_content: { data: result({ kind: 'deck', id: '123', found: false }) },
      unpublish_draft: { data: { found: false, removed: 0 } },
    });
    expect((await run(listFile, empty.db, { kind: 'deck', id: '123' })).calls.store).toBe(0);
  });

  describe('decks', () => {
    const deck = (over: Partial<UnpublishResult> = {}) =>
      result({
        kind: 'deck',
        id: '2059400110',
        title: 'Mazo',
        assessmentId: null,
        removed: { decks: 4, ankiNotes: 9, cards: 20, assessments: ['a/1', 'b/2'] },
        ...over,
      });

    it('a deck above the assessments is refused unless it is asked for, and the message counts what it would take', async () => {
      const { db } = database({ unpublish_content: { data: deck() } });
      const e = await run(file('above'), db, { kind: 'deck', id: '2059400110' }).catch(
        (x: unknown) => x,
      );
      expect((e as Error).message).toContain('«Mazo» está sobre las evaluaciones');
      expect((e as Error).message).toContain('las 2 evaluaciones a/1, b/2 con 4 mazos');
      const one = database({
        unpublish_content: { data: deck({ title: null, removed: { assessments: ['a/1'] } }) },
      });
      const e1 = await run(file('above'), one.db, { kind: 'deck', id: '2059400110' }).catch(
        (x: unknown) => x,
      );
      expect((e1 as Error).message).toContain('el mazo 2059400110 está sobre'.replace('el', 'El'));
      expect((e1 as Error).message).toContain('se llevaría la evaluación a/1 con 0 mazos');
      const none = database({ unpublish_content: { data: deck({ removed: {} }) } });
      const e0 = await run(file('above'), none.db, { kind: 'deck', id: '2059400110' }).catch(
        (x: unknown) => x,
      );
      expect((e0 as Error).message).toContain('las 0 evaluaciones (ninguna) con 0 mazos');
    });

    it('with --above-assessment, or in a dry run, it goes on and the summary says why it needed the flag', async () => {
      const { db } = database({ unpublish_content: { data: deck() } });
      const lines: string[] = [];
      const log = (l: string) => lines.push(l);
      await run(file('above-ok'), db, { kind: 'deck', id: '2059400110', dryRun: true, log });
      expect(lines.join('\n')).toContain('para sacarlo hace falta --above-assessment');
      lines.length = 0;
      await run(file('above-ok'), db, {
        kind: 'deck',
        id: '2059400110',
        aboveAssessment: true,
        log,
      });
      expect(lines.join('\n')).not.toContain('hace falta --above-assessment');
    });

    it('a deck whose id is not a number is refused, and its index files go when it is taken off', async () => {
      const bad = database({
        unpublish_content: { data: deck({ id: 'Raíz::Mazo', assessmentId: 'a/1' }) },
      });
      await expect(
        run(file('deck-bad'), bad.db, { kind: 'deck', id: 'Raíz::Mazo' }),
      ).rejects.toThrow('El mazo Raíz::Mazo no tiene un id válido.');
      const ok = database({
        unpublish_content: {
          data: deck({ assessmentId: 'a/1', removed: { assessments: ['a/1', 'mal id'] } }),
        },
      });
      const { store, log } = storeOf();
      const outcome = await run(file('deck-ok'), ok.db, { kind: 'deck', id: '2059400110', store });
      expect(log).toEqual(['prefix browse/a/1/']);
      expect(outcome.indexFiles).toBe(3);
    });
  });

  describe('images', () => {
    const image = (over: Partial<UnpublishResult> = {}) =>
      result({ kind: 'image', id: KEY, found: false, title: null, assessmentId: null, ...over });

    it('an image that is in the store goes, and so does its thumbnail when there is one', async () => {
      const { db } = database({ unpublish_content: { data: image() } });
      const { store, log } = storeOf([KEY, THUMB]);
      const outcome = await run(file('img'), db, { kind: 'image', id: KEY, store });
      expect(log).toEqual([`delete ${KEY}`, `delete ${THUMB}`]);
      expect(outcome.indexFiles).toBe(1);
      expect(outcome.calls.store).toBe(4);
    });

    it('without a thumbnail only the image goes; one the store no longer has is still listed if a piece uses it', async () => {
      const { db } = database({ unpublish_content: { data: image() } });
      const a = storeOf([KEY]);
      await run(file('img2'), db, { kind: 'image', id: KEY, store: a.store });
      expect(a.log).toEqual([`delete ${KEY}`]);
      const used = database({
        unpublish_content: {
          data: image({ usedBy: [{ kind: 'note', id: 'AP-1', title: 'Uno' }] }),
        },
      });
      const lines: string[] = [];
      const b = storeOf([]);
      await run(file('img3'), used.db, {
        kind: 'image',
        id: KEY,
        store: b.store,
        log: (l: string) => lines.push(l),
      });
      expect(b.log).toEqual([]);
      expect(lines.join('\n')).toContain('Ya no está en R2');
      expect(lines.join('\n')).toContain('La usan 1: apunte Uno');
    });

    it('an image that is neither in the store nor used by anything does not exist; an id that is no key is refused', async () => {
      const { db } = database({ unpublish_content: { data: image() } });
      const e = await run(file('img4'), db, {
        kind: 'image',
        id: KEY,
        store: storeOf([]).store,
      }).catch((x: unknown) => x);
      expect((e as Error).message).toBe(
        `No existe la imagen ${KEY}: no está publicado. Revisa el id.`,
      );
      await expect(run(file('img5'), db, { kind: 'image', id: 'cards/x.png' })).rejects.toThrow(
        'No es un id de image válido: cards/x.png',
      );
    });

    it('an image that is already listed and no longer in the store is not asked about again', async () => {
      const listFile = file('img-listed');
      await writeFile(
        listFile,
        JSON.stringify({
          items: [{ kind: 'image', id: KEY, reason: 'antes', date: '2026-11-01' }],
        }),
      );
      const { db, calls } = database({ unpublish_content: { data: image() } });
      const outcome = await run(listFile, db, { kind: 'image', id: KEY, store: storeOf([]).store });
      expect(outcome.alreadyListed).toBe(true);
      expect(calls.map((c) => c.fn)).toEqual(['unpublish_content', 'unpublish_draft']);
    });
  });

  it('the date of the list entry is today unless the clock is given, and a dry run needs no reason', async () => {
    const { db } = database({ unpublish_content: { data: result() } });
    const listFile = file('today');
    await run(listFile, db, { now: undefined });
    const [item] = (JSON.parse(await readFile(listFile, 'utf8')) as { items: { date: string }[] })
      .items;
    expect(item!.date).toBe(new Date().toISOString().slice(0, 10));
    const outcome = await run(file('dry-no-reason'), db, { dryRun: true, reason: undefined });
    expect(outcome).toMatchObject({ applied: false, alreadyListed: false });
    expect(outcome.indexFiles).toBeUndefined();
    expect(outcome.ms).toBeGreaterThanOrEqual(0);
  });

  it('a piece taken off the draft logs only what was there; one the draft did not have logs nothing', async () => {
    const { db } = database({
      unpublish_content: { data: result({ found: false }) },
      unpublish_draft: { data: { found: false, removed: 0 } },
    });
    const lines: string[] = [];
    await run(file('quiet'), db, { log: (l: string) => lines.push(l) });
    expect(lines.some((l) => l.includes('borrador'))).toBe(false);
  });

  it('a deck that is already in the list but is still on the site goes again without writing the list a second time', async () => {
    const listFile = file('again');
    const entry = { kind: 'deck', id: '123', reason: 'antes', date: '2026-11-01' };
    await writeFile(listFile, JSON.stringify({ items: [entry] }));
    const { db, calls } = database({
      unpublish_content: {
        data: result({
          kind: 'deck',
          id: '123',
          assessmentId: 'a/1',
          removed: { assessments: undefined as never },
        }),
      },
    });
    const outcome = await run(listFile, db, { kind: 'deck', id: '123' });
    expect(outcome).toMatchObject({ applied: true, alreadyListed: true });
    expect((JSON.parse(await readFile(listFile, 'utf8')) as { items: unknown[] }).items).toEqual([
      entry,
    ]);
    expect(calls.map((c) => c.fn)).toEqual(['unpublish_content', 'unpublish_content']);
  });

  it('it does not need a log: the steps that would be told go on without one', async () => {
    const { db } = database({ unpublish_content: { data: result() } });
    const withoutLog = await run(file('no-log'), db);
    expect(withoutLog.applied).toBe(true);
    const listed = database({
      unpublish_content: { data: result({ found: false }) },
      unpublish_draft: { data: { found: true, removed: 1 } },
    });
    const again = await run(file('no-log'), listed.db);
    expect(again).toMatchObject({ applied: false, alreadyListed: true });
  });
});
