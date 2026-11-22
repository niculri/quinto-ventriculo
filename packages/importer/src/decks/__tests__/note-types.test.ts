// Tests the choice of the newest version of each note type and the mapping of the notes' fields by name.
import { describe, expect, it } from 'vitest';
import type { AnkiNote, AnkiNoteType, AnkiPackage } from '@qv/anki-format';
import { newestNoteTypes, remapNotes } from '../note-types';

const type = (over: Partial<AnkiNoteType> = {}): AnkiNoteType => ({
  id: '1',
  name: 'Básica',
  kind: 'normal',
  fields: ['Frente', 'Reverso'],
  templates: [],
  css: '',
  sortField: 0,
  mod: 100,
  originalStockKind: null,
  ...over,
});

const note = (fields: string[], noteTypeId = '1'): AnkiNote => ({
  id: '5',
  guid: 'g',
  noteTypeId,
  fields,
  tags: [],
});

const packageOf = (...noteTypes: AnkiNoteType[]) =>
  ({ collection: { noteTypes } }) as unknown as AnkiPackage;

describe('newestNoteTypes', () => {
  const read = (packages: Record<string, AnkiNoteType[]>) => async (path: string) =>
    packageOf(...packages[path]!);

  it('keeps the version with the highest mod, even when it is read first', async () => {
    const newest = await newestNoteTypes(
      ['nuevo', 'viejo'],
      read({
        nuevo: [type({ mod: 300, css: 'nuevo' })],
        viejo: [type({ mod: 200, css: 'viejo' })],
      }),
    );
    expect(newest.get('1')!.css).toBe('nuevo');
  });

  it('on equal mod and different content, the choice does not depend on the order, and it is reported', async () => {
    const packages = { a: [type({ css: 'a' })], b: [type({ css: 'b' })] };
    const ties: string[] = [];
    const forward = await newestNoteTypes(['a', 'b'], read(packages), (name) => ties.push(name));
    const backward = await newestNoteTypes(['b', 'a'], read(packages), (name) => ties.push(name));
    expect(forward.get('1')!.css).toBe(backward.get('1')!.css);
    expect(ties).toEqual(['Básica', 'Básica']);
  });

  it('on equal mod and equal content, nothing is reported', async () => {
    const ties: string[] = [];
    await newestNoteTypes(
      ['a', 'b'],
      read({ a: [type({ css: 'x' })], b: [type({ css: 'x' })] }),
      (name) => ties.push(name),
    );
    expect(ties).toEqual([]);
  });

  it('chooses each note type id on its own', async () => {
    const newest = await newestNoteTypes(
      ['a', 'b'],
      read({
        a: [type({ id: '1', mod: 9 }), type({ id: '2', mod: 1 })],
        b: [type({ id: '1', mod: 5 }), type({ id: '2', mod: 7 })],
      }),
    );
    expect([newest.get('1')!.mod, newest.get('2')!.mod]).toEqual([9, 7]);
  });
});

describe('remapNotes', () => {
  it('leaves the notes alone when the fields are the same', () => {
    const notes = [note(['a', 'b'])];
    const { notes: out, lost } = remapNotes(notes, [type()], new Map([['1', type({ mod: 200 })]]));
    expect(out[0]).toBe(notes[0]);
    expect(lost.size).toBe(0);
  });

  it('a field only the newest version has goes empty', () => {
    const newest = type({ fields: ['Frente', 'Reverso', 'Prioridad'] });
    const { notes } = remapNotes([note(['p', 'r'])], [type()], new Map([['1', newest]]));
    expect(notes[0]!.fields).toEqual(['p', 'r', '']);
  });

  it('fields go by name, not by position, and one the newest version lacks is dropped and reported', () => {
    const own = type({ fields: ['Frente', 'Antiguo', 'Reverso'] });
    const newest = type({ fields: ['Reverso', 'Frente'] });
    const { notes, lost } = remapNotes([note(['p', 'x', 'r'])], [own], new Map([['1', newest]]));
    expect(notes[0]!.fields).toEqual(['r', 'p']);
    expect([...lost.get('Básica')!]).toEqual(['Antiguo']);
  });

  it('does not report a dropped field that was empty', () => {
    const own = type({ fields: ['Frente', 'Antiguo'] });
    const newest = type({ fields: ['Frente'] });
    expect(remapNotes([note(['p', ''])], [own], new Map([['1', newest]])).lost.size).toBe(0);
  });
});
