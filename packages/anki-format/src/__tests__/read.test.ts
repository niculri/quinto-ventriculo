// Tests of the .apkg reader and the deck tree, on a synthetic sample package.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ApkgError, deckLeafName, deckTree, parentDeckName, readApkg, readApkgFile } from '..';
import { apkgBytes } from './apkgFile';

const SAMPLE = join(import.meta.dirname, '../../test/fixtures', 'sample.apkg');
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
      mod: 1793497867,
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
    const real = readFileSync(SAMPLE);
    const files = unzipSync(new Uint8Array(real));
    const swapped = zipSync({
      'collection.anki2': strToU8('roto'),
      'collection.anki21': files['collection.anki2']!,
      media: files.media!,
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

describe('the media of a package', () => {
  it('a package without a media file, or with an empty one, has no media', () => {
    expect(readApkg(apkgBytes({}, null)).mediaNames).toEqual([]);
    expect(readApkg(apkgBytes({}, '')).mediaNames).toEqual([]);
  });

  it('lists the names sorted and reads each file through its entry number', () => {
    const files = { '0': strToU8('cero'), '1': strToU8('uno') };
    const pkg = readApkg(apkgBytes({}, '{"1":"b.png","0":"a.png"}', files));
    expect(pkg.mediaNames).toEqual(['a.png', 'b.png']);
    expect(new TextDecoder().decode(pkg.readMedia('b.png')!)).toBe('uno');
  });

  it('a name whose entry is not in the zip reads as nothing', () => {
    const pkg = readApkg(apkgBytes({}, '{"7":"lost.png"}'));
    expect(pkg.mediaNames).toEqual(['lost.png']);
    expect(pkg.readMedia('lost.png')).toBeNull();
  });

  it('ignores entries whose name is not a string', () => {
    expect(
      readApkg(apkgBytes({}, '{"0":"a.png","1":5,"2":null}', { '0': strToU8('x') })).mediaNames,
    ).toEqual(['a.png']);
  });

  it('a media file that is not JSON is the new format, and one that is not an object is refused', () => {
    expect(() => readApkg(apkgBytes({}, 'binary\x00protobuf'))).toThrow(/no es JSON/);
    for (const bad of ['[]', '5', 'null', '"x"']) {
      expect(() => readApkg(apkgBytes({}, bad))).toThrow(/no tiene el formato esperado/);
    }
  });
});

describe('the collection inside', () => {
  const read = (c: Parameters<typeof apkgBytes>[0]) => readApkg(apkgBytes(c)).collection;

  it('has to be the classic schema, 11', () => {
    expect(() => read({ ver: 18 })).toThrow(/esquema 18.*clásico \(11\)/);
    expect(() => read({ ver: 10 })).toThrow(/esquema 10.*clásico \(11\)/);
    expect(read({ ver: 11 }).schemaVersion).toBe(11);
  });

  it('has to have its col row', () => {
    expect(() => read({ emptyCol: true })).toThrow(/vacía \(sin tabla col\)/);
  });

  it('whatever is not a SQLite file is a read error, not a crash', () => {
    const zip = zipSync({ 'collection.anki2': strToU8('not sqlite at all'), media: strToU8('{}') });
    expect(() => readApkg(zip)).toThrow(/No se pudo leer la colección del \.apkg/);
  });

  it('its models, decks and presets have to be JSON objects, and an empty column is an empty object', () => {
    expect(() => read({ models: '{broken' })).toThrow(/col\.models.*no es JSON válido/);
    expect(() => read({ decks: [1, 2] })).toThrow(/col\.decks/);
    expect(() => read({ dconf: 'null' })).toThrow(/col\.dconf/);
    expect(read({ models: '', decks: '', dconf: '' })).toMatchObject({
      noteTypes: [],
      decks: [],
      presets: [],
    });
  });

  it('a note type has its fields and templates in the order of their ord, and a kind from its type', () => {
    const [nt] = read({
      models: {
        '9': {
          id: 9,
          name: 'T',
          type: 1,
          sortf: 1,
          mod: 5,
          css: '.x{}',
          flds: [
            { name: 'B', ord: 1 },
            { name: 'A', ord: 0 },
          ],
          tmpls: [
            { name: 'two', ord: 1, qfmt: 'q2', afmt: 'a2' },
            { name: 'one', ord: 0, qfmt: 'q1', afmt: 'a1', bqfmt: 'bq', bafmt: 'ba' },
          ],
          originalStockKind: 6,
        },
      },
    }).noteTypes;
    expect(nt).toMatchObject({
      id: '9',
      kind: 'cloze',
      fields: ['A', 'B'],
      sortField: 1,
      mod: 5,
      originalStockKind: 6,
    });
    expect(nt!.templates.map((t) => t.name)).toEqual(['one', 'two']);
    expect(nt!.templates[0]).toMatchObject({ bqfmt: 'bq', bafmt: 'ba' });
    expect(nt!.templates[1]).toMatchObject({ bqfmt: '', bafmt: '' });
  });

  it('a note type with no fields, no templates and no stock kind has empty lists and a null kind', () => {
    const [nt] = read({
      models: { '1': { id: 1, name: 'Bare', type: 0, originalStockKind: null } },
    }).noteTypes;
    expect(nt).toMatchObject({
      kind: 'normal',
      fields: [],
      templates: [],
      originalStockKind: null,
      css: '',
      sortField: 0,
    });
    const [other] = read({
      models: { '1': { id: 1, name: 'Bare', flds: 'x', tmpls: 'y' } },
    }).noteTypes;
    expect(other).toMatchObject({ fields: [], templates: [], originalStockKind: null });
  });

  it('a filtered deck has no preset, and neither does one without a conf', () => {
    const decks = read({
      decks: {
        '1': { id: 1, name: 'Normal', conf: 3, desc: 'd' },
        '2': { id: 2, name: 'Filtered', dyn: 1, conf: 3 },
        '3': { id: 3, name: 'Bare' },
      },
    }).decks;
    expect(decks.map((d) => [d.name, d.presetId, d.filtered, d.description])).toEqual([
      ['Normal', '3', false, 'd'],
      ['Filtered', null, true, ''],
      ['Bare', null, false, ''],
    ]);
  });

  it('a card in a filtered deck remembers where it comes from; one at home has no original deck', () => {
    const cards = read({
      cards: [
        { id: 1, nid: 1, ord: 0, did: 5, odid: 7, flags: 3 },
        { id: 2, nid: 1, ord: 1, did: 5 },
      ],
    }).cards;
    expect(cards.map((c) => [c.ord, c.deckId, c.originalDeckId, c.flags])).toEqual([
      [0, '5', '7', 3],
      [1, '5', null, 0],
    ]);
  });

  it('the cards come sorted by note and template, not by their ids', () => {
    const cards = read({
      cards: [
        { id: 1, nid: 2, ord: 0, did: 1 },
        { id: 2, nid: 1, ord: 1, did: 1 },
        { id: 3, nid: 1, ord: 0, did: 1 },
      ],
    }).cards;
    expect(cards.map((c) => `${c.noteId}/${c.ord}`)).toEqual(['1/0', '1/1', '2/0']);
  });

  it('the tags come sorted without regard to case, once each, whatever separates them', () => {
    const [note] = read({
      notes: [
        { id: 1, guid: 'g', mid: 1, tags: ' beta Alpha　alpha  Gamma  beta ', flds: 'a\x1fb' },
      ],
    }).notes;
    expect(note!.tags).toEqual(['Alpha', 'beta', 'Gamma']);
    expect(note!.fields).toEqual(['a', 'b']);
    const [none] = read({ notes: [{ id: 2, guid: 'h', mid: 1, tags: '', flds: '' }] }).notes;
    expect(none!.tags).toEqual([]);
  });
});

describe('the zip itself', () => {
  /** A zip whose end record says it is zip64, with the real numbers in the zip64 record. */
  function asZip64(data: Uint8Array, flag = { count: true, offset: true }): Uint8Array {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const end = data.length - 22;
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    const offset = view.getUint32(end + 16, true);
    const record = new Uint8Array(56);
    const r = new DataView(record.buffer);
    r.setUint32(0, 0x06064b50, true);
    r.setBigUint64(4, 44n, true);
    r.setUint16(12, 45, true);
    r.setUint16(14, 45, true);
    r.setBigUint64(24, BigInt(count), true);
    r.setBigUint64(32, BigInt(count), true);
    r.setBigUint64(40, BigInt(size), true);
    r.setBigUint64(48, BigInt(offset), true);
    const locator = new Uint8Array(20);
    const l = new DataView(locator.buffer);
    l.setUint32(0, 0x07064b50, true);
    l.setBigUint64(8, BigInt(end), true);
    l.setUint32(16, 1, true);
    const tail = data.slice(end);
    const t = new DataView(tail.buffer);
    if (flag.count) t.setUint16(10, 0xffff, true);
    if (flag.offset) t.setUint32(16, 0xffffffff, true);
    return new Uint8Array([...data.subarray(0, end), ...record, ...locator, ...tail]);
  }

  it('reads a zip64 package, whose end record points to the real central directory', () => {
    const pkg = readApkg(
      asZip64(
        apkgBytes({ notes: [{ id: 1, guid: 'g', mid: 1, tags: '', flds: 'x' }] }, '{"0":"a.png"}', {
          '0': strToU8('png'),
        }),
      ),
    );
    expect(pkg.collection.notes).toHaveLength(1);
    expect(pkg.mediaNames).toEqual(['a.png']);
  });

  it('also when only one of the two numbers overflowed', () => {
    const data = apkgBytes();
    for (const flag of [
      { count: true, offset: false },
      { count: false, offset: true },
    ]) {
      expect(readApkg(asZip64(data, flag)).collection.schemaVersion).toBe(11);
    }
  });

  it('refuses a zip whose central directory is damaged, and says the zip cannot be read', () => {
    const data = apkgBytes();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const offset = view.getUint32(data.length - 22 + 16, true);
    view.setUint32(offset, 0, true);
    expect(() => readApkg(data)).toThrow(/zip ilegible.*directorio central dañado/);
  });

  it('finds the end of the zip even when a comment follows it', () => {
    const data = apkgBytes();
    const withComment = new Uint8Array(data.length + 5);
    withComment.set(data);
    new DataView(withComment.buffer).setUint16(data.length - 22 + 20, 5, true);
    withComment.set(strToU8('hello'), data.length);
    expect(readApkg(withComment).collection.schemaVersion).toBe(11);
  });
});

describe('deckTree with decks the package leaves out', () => {
  const deck = (id: string, name: string) => ({
    id,
    name,
    description: '',
    presetId: null,
    filtered: false,
  });
  const collection = (decks: ReturnType<typeof deck>[], dids: string[]) => ({
    schemaVersion: 11,
    noteTypes: [],
    presets: [],
    notes: [],
    decks,
    cards: dids.map((deckId, i) => ({
      id: `${i}`,
      noteId: '1',
      ord: i,
      deckId,
      originalDeckId: null,
      flags: 0,
    })),
  });

  it('an ancestor without cards is kept with a count of zero, and a deck skips the ancestors that are not in the package', () => {
    const tree = deckTree(collection([deck('1', 'A'), deck('3', 'A::B::C')], ['3']));
    expect(tree.map((n) => [n.deck.name, n.parentId, n.cardCount])).toEqual([
      ['A', null, 0],
      ['A::B::C', '1', 1],
    ]);
  });

  it('puts parents before children whatever order the package lists them in', () => {
    const tree = deckTree(
      collection([deck('2', 'A::B'), deck('1', 'A'), deck('4', 'B')], ['2', '4']),
    );
    expect(tree.map((n) => n.deck.name)).toEqual(['A', 'A::B', 'B']);
  });

  it('two decks with the same name stay, in the order they came', () => {
    const tree = deckTree(collection([deck('1', 'Same'), deck('2', 'Same')], ['1', '2']));
    expect(tree.map((n) => n.deck.id)).toEqual(['1', '2']);
  });

  it('a card in a deck that does not exist does not add one', () => {
    expect(deckTree(collection([deck('1', 'A')], ['9']))).toEqual([]);
  });
});
