// Tests that what content/unpublished.json lists is left out of every import.
import { ContentBundle } from '@qv/schema';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readManifest, readUnpublished } from '../../manifest/read';
import type { Manifest } from '../../manifest/schemas';
import { processCardImage, processImage } from '../../media/images';
import { FolderTarget } from '../../targets/folder';
import { PRIVATE, createRoot, manifest, privately } from '../../test/importer-fixtures';
import { buildBundle } from '../build';
import { hash } from '../hash';
import { sameUnpublished } from '../unpublished';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('content/unpublished.json', () => {
  const off = (kind: 'note' | 'deck' | 'quiz' | 'image', id: string) => ({
    kind,
    id,
    reason: 'Error grave',
    date: '2026-11-08',
  });
  const DECK = '2059400110';
  const EXTRAS = '2059400111';
  const withList = (items: ReturnType<typeof off>[]): Manifest => ({
    ...structuredClone(manifest),
    decks: [
      { assessmentId: 'anatomia-1/certamen-1', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] },
    ],
    unpublished: items,
  });
  const buildWith = (m: Manifest, extra: Partial<Parameters<typeof buildBundle>[0]> = {}) =>
    buildBundle({
      manifest: m,
      root,
      process: processImage,
      processCardImage,
      now: () => new Date('2026-11-08T12:00:00Z'),
      ...extra,
    });

  it('an article of the list is not read nor converted (a broken one does not stop the import), and the report says so', async () => {
    const m = withList([off('note', 'AP-BC-C2-12')]);
    m.notes[0]!.notes[1]!.sourceFile = 'no-existe/apunte.md';
    const r = await buildWith(m);
    expect(r.bundle.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11']);
    expect(r.unpublished).toEqual([{ kind: 'note', id: 'AP-BC-C2-12', what: '«Comunicación»' }]);
    await expect(buildWith(m, { only: ['AP-BC-C2-12'] })).rejects.toThrow(
      /AP-BC-C2-12 está en content\/unpublished\.json/,
    );
  });

  it('a deck goes with every deck below it, its notes and the images only they used', async () => {
    const all = await buildWith(withList([]));
    const r = await buildWith(withList([off('deck', DECK)]));
    expect(r.bundle.ankiDecks.map((d) => d.id)).not.toContain(DECK);
    expect(r.bundle.ankiDecks.map((d) => d.id)).not.toContain(EXTRAS);
    expect(r.bundle.ankiDecks).toHaveLength(all.bundle.ankiDecks.length - 2);
    expect(r.bundle.ankiNotes).toEqual([]);
    const cardKeys = [...all.media.keys()].filter((k) => k.startsWith('cards/'));
    expect(cardKeys.length).toBeGreaterThan(0);
    expect([...r.media.keys()].filter((k) => k.startsWith('cards/'))).toEqual([]);
    expect(r.unpublished).toEqual([
      { kind: 'deck', id: DECK, what: '«Mazo de prueba» (2 mazos, 7 notas, 16 tarjetas)' },
    ]);
    expect(() => ContentBundle.parse(r.bundle)).not.toThrow();
  });

  it('only the subdeck: the notes with cards above stay with those, with another hash', async () => {
    const all = await buildWith(withList([]));
    const r = await buildWith(withList([off('deck', EXTRAS)]));
    const inExtras = all.bundle.ankiNotes.filter((n) => n.cards.some((c) => c.deckId === EXTRAS));
    expect(inExtras.length).toBeGreaterThan(0);
    for (const before of all.bundle.ankiNotes) {
      const after = r.bundle.ankiNotes.find((n) => n.guid === before.guid);
      const kept = before.cards.filter((c) => c.deckId !== EXTRAS);
      if (!kept.length) {
        expect(after).toBeUndefined();
        continue;
      }
      expect(after!.cards).toEqual(kept);
      if (kept.length === before.cards.length) expect(after!.hash).toBe(before.hash);
      else {
        const { hash: h, updatedAt: _u, ...rest } = after!;
        expect(h).not.toBe(before.hash);
        expect(h).toBe(hash(rest));
      }
    }
  });

  it('a test of the list is not converted', async () => {
    const m = withList([off('quiz', 'biologia-celular-certamen-2-practica')]);
    m.tests = [
      {
        assessmentId: 'biologia-celular/certamen-2',
        tests: [{ slug: 'practica', position: 1, folder: 'no-existe', title: 'Práctica' }],
      },
    ];
    const r = await buildWith(m);
    expect(r.bundle.quizzes).toEqual([]);
    expect(r.unpublished).toEqual([
      { kind: 'quiz', id: 'biologia-celular-certamen-2-practica', what: '«Práctica»' },
    ]);
  });

  it('an image of the list that a published piece uses stops the import, in the folder and in the cloud', async () => {
    const all = await buildWith(withList([]));
    const key = all.bundle.notes[0]!.media[0]!;
    await expect(buildWith(withList([off('image', key)]))).rejects.toThrow(
      new RegExp(
        `la imagen ${key.replace('.', '\\.')} está en content/unpublished\\.json y la usa apunte AP-BC-C2-11, apunte AP-BC-C2-12`,
      ),
    );
    const r = await buildWith(
      withList([off('image', key), off('note', 'AP-BC-C2-11'), off('note', 'AP-BC-C2-12')]),
    );
    expect(r.media.has(key)).toBe(false);
  });

  it('FolderTarget (dry run): what the list names leaves content.json and never comes back while it is there', async () => {
    const output = join(root, '.output-unpublished');
    const target = new FolderTarget(output);
    const all = await buildWith(withList([]));
    await target.save(all.bundle, all.media);
    const r = await buildWith(withList([off('note', 'AP-BC-C2-12'), off('deck', DECK)]));
    const report = await target.save(r.bundle, r.media);
    expect(report).toMatchObject({ removedNotes: 1, removedCards: 7 });
    const saved = ContentBundle.parse(
      JSON.parse(await readFile(join(output, 'content.json'), 'utf8')),
    );
    expect(saved.notes.map((n) => n.id)).toEqual(['AP-BC-C2-11']);
    expect(saved.ankiNotes).toEqual([]);
    expect(saved.ankiDecks.map((d) => d.id)).not.toContain(DECK);
  });

  it('readUnpublished: a missing file is nothing; a bad id, a missing reason or a repeat is an error', async () => {
    const file = join(root, 'unpublished.json');
    expect(await readUnpublished(join(root, 'no-existe.json'))).toEqual([]);
    const write = (items: unknown[]) => writeFile(file, JSON.stringify({ items }));
    await write([
      off('note', 'AP-BC-C2-11'),
      off('deck', DECK),
      off('quiz', 'practica-bc'),
      off('image', 'notes/0123456789abcdef.webp'),
    ]);
    expect(await readUnpublished(file)).toHaveLength(4);
    for (const bad of [
      off('note', 'QV-BC-C2-11'),
      off('deck', 'Mazo de prueba'),
      off('image', 'notes/../x.webp'),
      { ...off('note', 'AP-BC-C2-11'), reason: ' ' },
      { ...off('note', 'AP-BC-C2-11'), date: 'ayer' },
    ]) {
      await write([bad]);
      await expect(readUnpublished(file)).rejects.toThrow();
    }
    await write([off('note', 'AP-BC-C2-11'), off('note', 'AP-BC-C2-11')]);
    await expect(readUnpublished(file)).rejects.toThrow(/repetido/);
  });

  it('sameUnpublished: the same pieces in any order; an entry more or less, or another reason only, as it is', () => {
    const a = [off('note', 'AP-BC-C2-11'), off('deck', DECK)];
    expect(sameUnpublished(a, [...a].reverse())).toBe(true);
    expect(sameUnpublished(a, [{ ...a[0]!, reason: 'Otro motivo' }, a[1]!])).toBe(true);
    expect(sameUnpublished(a, [a[0]!])).toBe(false);
    expect(sameUnpublished([], [off('quiz', 'practica-bc')])).toBe(false);
    expect(sameUnpublished(a, [a[0]!, off('deck', EXTRAS)])).toBe(false);
  });

  it.skipIf(!PRIVATE.content)(
    privately(
      "the private repository's manifest is valid; the Seminario 8 is in the Certamen 3 with its identity",
    ),
    async () => {
      const m = await readManifest(PRIVATE.content!, { history: null });
      const ids = m.catalog.assessments.map((a) => a.id);
      for (const id of [
        'anatomia-1/certamen-1',
        'anatomia-1/certamen-3',
        'biologia-celular/certamen-2',
        'biologia-celular/certamen-3',
        'salud-publica/certamen',
        'bioestadistica/control-sumativo-6',
      ]) {
        expect(ids).toContain(id);
      }
      expect(new Set(ids).size).toBe(ids.length);
      const of = (course: string) =>
        m.catalog.assessments.filter((a) => a.courseId === course).map((a) => a.name);
      expect(of('anatomia-1')).toEqual(['Certamen 1', 'Certamen 2', 'Certamen 3']);
      expect(of('matematicas')).toEqual(['Certamen 1', 'Certamen 2', 'Certamen 3']);
      expect(of('quimica-general-y-organica')).toEqual(['Certamen 1', 'Certamen 2']);
      expect(of('medicina-persona-y-sociedad')).toEqual(['Certamen 1', 'Certamen 2']);
      expect(of('introduccion-a-la-profesion-medica')).toEqual([
        'Curso de vida y comunicación efectiva',
        'Primeros auxilios y signos vitales',
        'Ser médica/o en la Universidad de Chile',
      ]);
      expect(of('bioestadistica')).toEqual([1, 2, 3, 4, 5, 6].map((i) => `Control sumativo ${i}`));
      expect(m.catalog.assessments.filter((a) => /examen/i.test(a.name))).toEqual([]);
      expect(
        m.catalog.assessments.filter((a) => 'suggestedDate' in a && a.suggestedDate != null),
      ).toEqual([]);
      const where = m.notes.flatMap((g) =>
        g.notes.map((n) => ({ assessmentId: g.assessmentId, ...n })),
      );
      const seminar = where.find((n) => n.id === 'AP-BC-C2-SEM8')!;
      expect(seminar).toMatchObject({
        assessmentId: 'biologia-celular/certamen-3',
        code: 'QV-BC-C2-SEM8',
        slug: 'seminario-8-comunicacion-intercelular',
      });
      expect(seminar.practice).toBeUndefined();
      expect(seminar.sourceFile).toContain('/Certamen 3/Seminario 8 - Comunicación intercelular/');
    },
  );

  it.skipIf(!PRIVATE.content)(
    privately('content/unpublished.json of the private repository is valid (and empty)'),
    async () => {
      const items = await readUnpublished(join(PRIVATE.content!, 'unpublished.json'));
      expect(items).toEqual([]);
    },
  );
});
