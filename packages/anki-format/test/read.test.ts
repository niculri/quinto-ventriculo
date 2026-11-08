import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ApkgError, deckLeafName, deckTree, parentDeckName, readApkg, readApkgFile } from '../src';

const SAMPLE = join(import.meta.dirname, 'fixtures', 'sample.apkg');
const ROOT =
  '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba::Mazo de prueba';

describe('readApkg', () => {
  it('reads note types with fields, templates, CSS and kind', async () => {
    const { collection } = await readApkgFile(SAMPLE);
    expect(collection.schemaVersion).toBe(11);
    const byName = new Map(collection.noteTypes.map((t) => [t.name, t]));
    const basic = byName.get('Prueba · Básica')!;
    expect(basic).toMatchObject({
      id: '1607392319',
      kind: 'normal',
      fields: ['Frente', 'Reverso', 'Imagen', 'Extra', 'Pista', 'Código'],
      sortField: 0,
    });
    expect(basic.templates.map((t) => t.name)).toEqual(['Directa', 'Inversa']);
    expect(basic.templates[0]!.qfmt).toContain('{{hint:Pista}}');
    expect(basic.css).toContain('.card');
    expect(byName.get('Prueba · Cloze')!.kind).toBe('cloze');
    expect(byName.get('Prueba · Oclusión')!.templates[0]!.qfmt).toContain('image-occlusion');
  });

  it('reads decks with their presets, and presets with their whole configuration', async () => {
    const { collection } = await readApkgFile(SAMPLE);
    const root = collection.decks.find((d) => d.name === ROOT)!;
    const extras = collection.decks.find((d) => d.name === `${ROOT}::Extras`)!;
    expect(root).toMatchObject({ id: '2059400110', presetId: '1', filtered: false });
    expect(root.description).toBe('Mazo sintético para las pruebas');
    const presets = new Map(collection.presets.map((p) => [p.id, p]));
    expect(presets.get('1')!.name).toBe('Default');
    const extrasPreset = presets.get(extras.presetId!)!;
    expect(extrasPreset.name).toBe('Extras');
    expect(extrasPreset.config).toMatchObject({ new: { perDay: 0 }, rev: { perDay: 100 } });
  });

  it('reads notes (guid, fields in order, tags) and cards (note, ord, deck)', async () => {
    const { collection } = await readApkgFile(SAMPLE);
    expect(collection.notes).toHaveLength(7);
    expect(collection.cards).toHaveLength(16);
    const note = collection.notes.find((n) => n.guid === 'Or&8~[!Z2<')!;
    expect(note.fields[0]).toBe('¿Cuántas vértebras <b>cervicales</b> hay?');
    expect(note.fields).toHaveLength(6);
    expect(note.tags.sort()).toEqual(['columna::cervical', 'prueba']);
    const cards = collection.cards.filter((c) => c.noteId === note.id);
    expect(cards.map((c) => [c.ord, c.deckId])).toEqual([
      [0, '2059400110'],
      [1, '2059400110'],
    ]);
  });

  it('reads the media map and the files', async () => {
    const pkg = await readApkgFile(SAMPLE);
    expect(pkg.mediaNames).toEqual(['prueba_corazon.png', 'prueba_vertebra.png']);
    const png = pkg.readMedia('prueba_vertebra.png')!;
    expect([...png.subarray(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
    expect(pkg.readMedia('no-existe.png')).toBeNull();
  });

  it('rejects the new format (anki21b) with a clear message', () => {
    const zip = zipSync({ 'collection.anki21b': strToU8('zstd'), media: strToU8('') });
    expect(() => readApkg(zip)).toThrow(ApkgError);
    expect(() => readApkg(zip)).toThrow(/anki21b/);
  });

  it('rejects files that are not a package', () => {
    expect(() => readApkg(strToU8('no soy un zip'))).toThrow(/no es un \.apkg válido/i);
    expect(() => readApkg(zipSync({ 'otra.txt': strToU8('x') }))).toThrow(/collection\.anki2/);
  });

  it('prefers collection.anki21 over the legacy collection.anki2', () => {
    // A package with a broken anki2 and a valid anki21 is read from the anki21.
    const real = readFileSync(SAMPLE);
    const files = unzipSync(new Uint8Array(real));
    const swapped = zipSync({
      'collection.anki2': strToU8('roto'),
      'collection.anki21': files['collection.anki2']!,
      media: files['media']!,
    });
    expect(readApkg(swapped).collection.notes).toHaveLength(7);
  });
});

describe('deckTree', () => {
  it('keeps the decks with cards and their ancestors, without the empty Default', async () => {
    const { collection } = await readApkgFile(SAMPLE);
    const tree = deckTree(collection);
    expect(tree.map((n) => [n.deck.name, n.parentId, n.cardCount])).toEqual([
      [ROOT, null, 12],
      [`${ROOT}::Extras`, '2059400110', 4],
    ]);
  });

  it('names', () => {
    expect(parentDeckName('a::b::c')).toBe('a::b');
    expect(parentDeckName('a')).toBeNull();
    expect(deckLeafName('a::b::c')).toBe('c');
    expect(deckLeafName('a')).toBe('a');
  });
});
