// Tests the dry-run folder: what it writes, keeps and removes between imports.
import { ContentBundle } from '@qv/schema';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../bundle/build';
import type { Manifest } from '../../manifest/schemas';
import { processImage } from '../../media/images';
import { createRoot, manifest, twoAssessments } from '../../test/importer-fixtures';
import { FolderTarget } from '../folder';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

const build = () =>
  buildBundle({
    manifest,
    root,
    process: processImage,
    now: () => new Date('2026-10-31T12:00:00Z'),
  });

describe('FolderTarget', () => {
  it('writes content.json and the images, and keeps updatedAt if nothing changed', async () => {
    const output = join(root, '.output');
    const target = new FolderTarget(output);
    const first = await build();
    const r1 = await target.save(first.bundle, first.media);
    expect(r1).toMatchObject({
      changedNotes: ['AP-BC-C2-11', 'AP-BC-C2-12'],
      mediaUploaded: 1,
    });

    const second = await buildBundle({
      manifest,
      root,
      process: processImage,
      now: () => new Date('2026-11-01T00:00:00Z'),
    });
    const r2 = await target.save(second.bundle, second.media);
    expect(r2).toMatchObject({ changedNotes: [], mediaUploaded: 0, mediaExisting: 1 });

    const saved = ContentBundle.parse(
      JSON.parse(await readFile(join(output, 'content.json'), 'utf8')),
    );
    expect(saved.notes[0]!.updatedAt).toBe('2026-10-31T12:00:00.000Z');
    const key = saved.notes[0]!.media[0]!;
    expect((await readFile(join(output, 'media', key))).length).toBeGreaterThan(0);
  });

  it('gives the article its version and dates: the same on a second import, the next one if it changes', async () => {
    const output = join(root, '.output-versions');
    const target = new FolderTarget(output);
    const at = (iso: string, m: Manifest = manifest) =>
      buildBundle({ manifest: m, root, process: processImage, now: () => new Date(iso) });
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8'))).notes;

    const first = await at('2026-11-01T10:00:00Z');
    await target.save(first.bundle, first.media);
    const [firstNote, b] = await read();
    let a = firstNote;
    expect(a).toMatchObject({
      version: 1,
      publishedAt: '2026-11-01T10:00:00.000Z',
      versionAt: '2026-11-01T10:00:00.000Z',
    });
    expect(b!.version).toBeUndefined();

    const second = await at('2026-11-02T10:00:00Z');
    expect((await target.save(second.bundle, second.media)).changedNotes).toEqual([]);
    [a] = await read();
    expect(a).toMatchObject({ version: 1, versionAt: '2026-11-01T10:00:00.000Z' });

    const links: Manifest = structuredClone(manifest);
    links.notes[0]!.notes[0]!.practice = { deck: 'Otro' };
    const third = await at('2026-11-03T10:00:00Z', links);
    expect((await target.save(third.bundle, third.media)).changedNotes).toEqual(['AP-BC-C2-11']);
    [a] = await read();
    expect(a).toMatchObject({
      version: 1,
      versionAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z',
    });

    const sources: Manifest = structuredClone(links);
    sources.notes[0]!.notes[0]!.sources = ['Clase 11 de 2026'];
    const fourth = await at('2026-11-04T10:00:00Z', sources);
    await target.save(fourth.bundle, fourth.media);
    [a] = await read();
    expect(a).toMatchObject({
      version: 2,
      publishedAt: '2026-11-01T10:00:00.000Z',
      versionAt: '2026-11-04T10:00:00.000Z',
    });
  });

  it('a note that changes assessment and gets a group keeps its id, slug, version and dates', async () => {
    const output = join(root, '.output-moved');
    const target = new FolderTarget(output);
    const at = (iso: string, m: Manifest) =>
      buildBundle({ manifest: m, root, process: processImage, now: () => new Date(iso) });
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8'))).notes;
    const first = await at('2026-11-01T10:00:00Z', manifest);
    await target.save(first.bundle, first.media);
    const [before] = await read();

    const moved: Manifest = structuredClone(manifest);
    moved.catalog.assessments.push({
      id: 'biologia-celular/certamen-3',
      courseId: 'biologia-celular',
      name: 'Certamen 3',
      position: 3,
    });
    const [entry] = moved.notes[0]!.notes.splice(0, 1);
    moved.notes.push({
      assessmentId: 'biologia-celular/certamen-3',
      notes: [{ ...entry!, position: 1, group: 'Semana 9' }],
    });
    const second = await at('2026-11-02T10:00:00Z', moved);
    expect((await target.save(second.bundle, second.media)).changedNotes).toEqual(['AP-BC-C2-11']);
    const after = (await read()).find((n) => n.id === 'AP-BC-C2-11')!;
    expect(after).toMatchObject({
      slug: before!.slug,
      code: before!.code,
      version: 1,
      publishedAt: before!.publishedAt,
      versionAt: before!.versionAt,
      assessmentId: 'biologia-celular/certamen-3',
      group: 'Semana 9',
    });
    expect(after.versionHash).toBe(before!.versionHash);
  });

  it('a note published before the articles (no version) is version 1 on its first save as one', async () => {
    const output = join(root, '.output-upgrade');
    const old = await build();
    const pdf = old.bundle.notes.map(({ code: _c, versionHash: _v, ...n }) => ({
      ...n,
      hash: 'pdf',
    }));
    await new FolderTarget(output).save({ ...old.bundle, notes: pdf }, old.media);
    const now = await buildBundle({
      manifest,
      root,
      process: processImage,
      now: () => new Date('2026-11-05T00:00:00Z'),
    });
    await new FolderTarget(output).save(now.bundle, now.media);
    const [a] = ContentBundle.parse(
      JSON.parse(await readFile(join(output, 'content.json'), 'utf8')),
    ).notes;
    expect(a).toMatchObject({ version: 1, publishedAt: '2026-11-05T00:00:00.000Z' });
  });

  it('with --only keeps the others; without --only, a note that left the manifest leaves', async () => {
    const output = join(root, '.output-only');
    const all = await build();
    await new FolderTarget(output).save(all.bundle, all.media);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')))
        .notes.map((n) => n.id)
        .sort();

    const only = await buildBundle({
      manifest,
      root,
      process: processImage,
      only: ['AP-BC-C2-12'],
    });
    await new FolderTarget(output, true).save(only.bundle, only.media);
    expect(await read()).toEqual(['AP-BC-C2-11', 'AP-BC-C2-12']);
    await new FolderTarget(output).save(only.bundle, only.media);
    expect(await read()).toEqual(['AP-BC-C2-12']);
  });
});

describe('the image cache, --assessment and the batches', () => {
  it('FolderTarget with --assessment keeps the other assessment as it was, and removes only inside it', async () => {
    const output = join(root, '.output-assessment');
    const target = new FolderTarget(output);
    const all = await buildBundle({ manifest: twoAssessments, root, process: processImage });
    await target.save(all.bundle, all.media);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')));
    const before = await read();

    const m = structuredClone(twoAssessments);
    m.notes[0]!.notes = m.notes[0]!.notes.filter((n) => n.id !== 'AP-BC-C2-11');
    const bc = await buildBundle({
      manifest: m,
      root,
      process: processImage,
      assessments: ['biologia-celular/certamen-2'],
    });
    const r = await target.save(bc.bundle, bc.media, {
      notes: true,
      decks: true,
      tests: true,
      assessments: ['biologia-celular/certamen-2'],
    });
    expect(r).toMatchObject({ removedNotes: 1, removedCards: 0, changedCards: [] });
    const after = await read();
    expect(after.notes.map((n) => n.id).sort()).toEqual(['AP-A1-S3-01', 'AP-BC-C2-12']);
    expect(after.ankiNotes).toEqual(before.ankiNotes);
    expect(after.ankiDecks).toEqual(before.ankiDecks);
    expect(after.ankiNoteTypes).toEqual(before.ankiNoteTypes);
    expect(after.ankiPresets).toEqual(before.ankiPresets);
    expect(after.notes.find((n) => n.id === 'AP-A1-S3-01')).toEqual(
      before.notes.find((n) => n.id === 'AP-A1-S3-01'),
    );

    const n = structuredClone(twoAssessments);
    n.decks = [];
    const an = await buildBundle({
      manifest: n,
      root,
      process: processImage,
      assessments: ['anatomia-1/certamen-1'],
    });
    const r2 = await target.save(an.bundle, an.media, {
      notes: true,
      decks: true,
      tests: true,
      assessments: ['anatomia-1/certamen-1'],
    });
    expect(r2.removedCards).toBe(7);
    const last = await read();
    expect(last.ankiNotes).toEqual([]);
    expect(last.notes.map((n) => n.id).sort()).toEqual(['AP-A1-S3-01', 'AP-BC-C2-12']);
    expect(last.ankiDecks.every((d) => d.assessmentId === null)).toBe(true);
    expect(last.ankiDecks.length).toBeGreaterThan(0);
  });

  it('FolderTarget without decks (--only, --only-tests) writes the new notes and catalog, and keeps the decks', async () => {
    const output = join(root, '.output-no-decks');
    const target = new FolderTarget(output, true);
    const all = await buildBundle({ manifest: twoAssessments, root, process: processImage });
    await target.save(all.bundle, all.media);
    const read = async () =>
      ContentBundle.parse(JSON.parse(await readFile(join(output, 'content.json'), 'utf8')));
    const before = await read();

    const next = structuredClone(all.bundle);
    const note = next.notes.find((n) => n.id === 'AP-BC-C2-12')!;
    note.title = 'Comunicación celular (corregida)';
    note.hash = 'cambiada';
    next.assessments[0]!.name = 'Certamen 1 (renombrado)';
    const r = await target.save({ ...next, notes: [note] }, all.media, {
      notes: true,
      decks: false,
      tests: false,
      partialNotes: true,
    });
    expect(r.changedNotes).toEqual(['AP-BC-C2-12']);
    const after = await read();
    expect(after.notes.find((n) => n.id === 'AP-BC-C2-12')!.title).toBe(
      'Comunicación celular (corregida)',
    );
    expect(after.notes.map((n) => n.id).sort()).toEqual(before.notes.map((n) => n.id).sort());
    expect(after.assessments[0]!.name).toBe('Certamen 1 (renombrado)');
    expect(after.ankiNotes).toEqual(before.ankiNotes);
    expect(after.ankiDecks).toEqual(before.ankiDecks);
  });
});
