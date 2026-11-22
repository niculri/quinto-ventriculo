// Tests the rows of the card browser: the kind of each note, the text it shows, its place and its order.
import type { AnkiNoteTypeRecord, ImportedAnkiNote } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { buildCardIndexes, cardIndexCards } from '../cardIndex';

const type = (id: string, fields: string[], extra: Partial<AnkiNoteTypeRecord> = {}) =>
  ({
    id,
    name: `Tipo ${id}`,
    kind: 'normal',
    occlusion: false,
    fields,
    templates: [{ name: 'Tarjeta 1', qfmt: '', afmt: '' }],
    css: '',
    sortField: 0,
    ...extra,
  }) satisfies AnkiNoteTypeRecord;

const BASIC = type('1', ['Frente', 'Reverso']);
const CLOZE = type('2', ['Texto'], { kind: 'cloze' });
const PHOTO = type('3', ['Pregunta', 'Respuesta', 'Etiqueta']);
const OCCLUSION = type('4', ['Encabezado', 'Máscaras'], { occlusion: true });
const TYPES = [BASIC, CLOZE, PHOTO, OCCLUSION];

const DECKS = [
  { id: 'd1', assessmentId: 'ramo/c1' },
  { id: 'd2', assessmentId: 'ramo/c2' },
  { id: 'd0', assessmentId: null },
];

const note = (
  guid: string,
  noteTypeId: string,
  fields: Record<string, string>,
  cards: { ord: number; deckId: string; frontHtml?: string; sortField?: string }[],
  extra: Partial<ImportedAnkiNote> = {},
) =>
  ({
    guid,
    noteTypeId,
    fields,
    tags: [],
    code: null,
    version: 1,
    createdAt: null,
    cards: cards.map((c) => ({ frontHtml: '', sortField: '', ...c })),
    ...extra,
  }) as unknown as ImportedAnkiNote;

const build = (notes: ImportedAnkiNote[], assessments?: string[]) =>
  buildCardIndexes({
    noteTypes: TYPES,
    decks: DECKS,
    notes,
    ...(assessments ? { assessments } : {}),
  });

describe('buildCardIndexes: what each kind of note shows', () => {
  it('a basic note shows its topic, front and back; a cloze note, its text and nothing at the back', () => {
    const [index] = build([
      note('b', '1', { Tema: '<b>Tema</b>', Frente: 'Pregunta <i>uno</i>', Reverso: 'Resp' }, [
        { ord: 0, deckId: 'd1' },
      ]),
      note('c', '2', { Encabezado: 'Otro tema', Texto: 'El {{c1::ribosoma}}' }, [
        { ord: 0, deckId: 'd1' },
      ]),
    ]);
    const [basic, cloze] = index!.notes.sort((a, b) => a.guid.localeCompare(b.guid));
    expect(basic).toMatchObject({
      kind: 'basic',
      topic: 'Tema',
      front: 'Pregunta uno',
      back: 'Resp',
    });
    expect(cloze).toMatchObject({ kind: 'cloze', topic: 'Otro tema', back: '' });
    expect(cloze!.front).toContain('ribosoma');
  });

  it('a type with question, answer and label fields is a photo note and its back is the label', () => {
    const [index] = build([
      note('f', '3', { Pregunta: 'img', Respuesta: 'img', Etiqueta: 'Fémur' }, [
        { ord: 0, deckId: 'd1', frontHtml: '<img data-media="cards/' + 'a'.repeat(32) + '.webp">' },
      ]),
    ]);
    expect(index!.notes[0]).toMatchObject({
      kind: 'photo',
      back: 'Fémur',
      front: '',
      thumb: `cards/thumb/${'a'.repeat(32)}.webp`,
    });
  });

  it('an occlusion note blanks its shapes field, counts its masks and uses its first image as thumbnail', () => {
    const [index] = build([
      note(
        'o',
        '4',
        {
          Encabezado: 'Corte',
          Máscaras: 'image-occlusion:rect:left=1 image-occlusion:rect:left=2 image-occlusion:text',
        },
        [{ ord: 1, deckId: 'd1', frontHtml: `<img data-media="cards/${'b'.repeat(32)}.webp">` }],
      ),
    ]);
    const n = index!.notes[0]!;
    expect(n).toMatchObject({ kind: 'occlusion', labels: 3, front: 'Corte' });
    expect(n.fields).toEqual(['Corte', '']);
    expect(n.thumb).toBe(`cards/thumb/${'b'.repeat(32)}.webp`);
  });

  it('without a shapes marker the occlusion blanks its first field; a front without an image has no thumbnail', () => {
    const [index] = build([
      note('o', '4', { Encabezado: 'Corte', Máscaras: 'nada' }, [{ ord: 0, deckId: 'd1' }]),
    ]);
    const n = index!.notes[0]!;
    expect(n.fields).toEqual(['', 'nada']);
    expect(n).toMatchObject({ labels: 0, thumb: null });
  });

  it('an occlusion note that lacks its fields, or whose type has none, still gets a row', () => {
    const bare = type('6', [], { occlusion: true });
    const [index] = buildCardIndexes({
      noteTypes: [OCCLUSION, bare],
      decks: DECKS,
      notes: [
        note('o', '4', {}, [{ ord: 0, deckId: 'd1' }]),
        note('p', '6', {}, [{ ord: 0, deckId: 'd1' }]),
      ],
    });
    expect(index!.notes.map((n) => [n.fields, n.labels])).toEqual([
      [['', ''], 0],
      [[], 0],
    ]);
  });

  it('the text of a row is cut at 240 characters with an ellipsis, and exactly 240 is kept', () => {
    const [index] = build([
      note('a', '1', { Frente: 'x'.repeat(240), Reverso: 'y'.repeat(300) }, [
        { ord: 0, deckId: 'd1' },
      ]),
    ]);
    const n = index!.notes[0]!;
    expect(n.front).toBe('x'.repeat(240));
    expect(n.back).toHaveLength(240);
    expect(n.back.endsWith('…')).toBe(true);
    expect(n.back.slice(0, 239)).toBe('y'.repeat(239));
  });

  it('English field names and a missing topic work too: the first name that exists wins, even if empty', () => {
    const t = type('5', ['Front', 'Back']);
    const [index] = buildCardIndexes({
      noteTypes: [t],
      decks: DECKS,
      notes: [note('e', '5', { Front: 'Q', Back: 'A', Tema: '' }, [{ ord: 0, deckId: 'd1' }])],
    });
    expect(index!.notes[0]).toMatchObject({ front: 'Q', back: 'A', topic: '' });
  });

  it('the tags that name an origin, in any case or as a sub-tag, are the origins of the note', () => {
    const [index] = build([
      note('a', '1', {}, [{ ord: 0, deckId: 'd1' }], {
        tags: ['Profe', 'control::2025', 'controlador', 'otra'],
      }),
    ]);
    expect(index!.notes[0]!.origin).toEqual(['profe', 'control']);
  });
});

describe('buildCardIndexes: where the notes go and in what order', () => {
  it('a note goes to each assessment its cards are in, with only the cards that are there', () => {
    const indexes = build([
      note('m', '1', {}, [
        { ord: 1, deckId: 'd2' },
        { ord: 0, deckId: 'd1' },
        { ord: 2, deckId: 'd0' },
      ]),
    ]);
    expect(indexes.map((i) => i.assessmentId)).toEqual(['ramo/c1', 'ramo/c2']);
    expect(indexes[0]!.notes[0]!.cards).toEqual([{ ord: 0, deckId: 'd1' }]);
    expect(indexes[1]!.notes[0]!.cards).toEqual([{ ord: 1, deckId: 'd2' }]);
    expect(cardIndexCards(indexes[0]!)).toBe(1);
  });

  it('the indexes come out sorted by assessment however the notes were met', () => {
    const forward = [
      note('m', '1', {}, [
        { ord: 0, deckId: 'd1' },
        { ord: 1, deckId: 'd2' },
      ]),
    ];
    const backward = [
      note('m', '1', {}, [
        { ord: 0, deckId: 'd2' },
        { ord: 1, deckId: 'd1' },
      ]),
    ];
    for (const notes of [forward, backward]) {
      expect(build(notes).map((i) => i.assessmentId)).toEqual(['ramo/c1', 'ramo/c2']);
    }
  });

  it('--assessment limits the indexes; notes of unknown types or only in decks outside any assessment are left out', () => {
    const notes = [
      note('m', '1', {}, [
        { ord: 0, deckId: 'd1' },
        { ord: 1, deckId: 'd2' },
      ]),
      note('x', '99', {}, [{ ord: 0, deckId: 'd1' }]),
      note('y', '1', {}, [{ ord: 0, deckId: 'd0' }]),
      note('z', '1', {}, [{ ord: 0, deckId: 'sin-mazo' }]),
    ];
    expect(build(notes, ['ramo/c2']).map((i) => i.assessmentId)).toEqual(['ramo/c2']);
    expect(build(notes).flatMap((i) => i.notes.map((n) => n.guid))).toEqual(['m', 'm']);
  });

  it('lists only the note types of its notes, with the names of their templates', () => {
    const [index] = build([note('m', '3', {}, [{ ord: 0, deckId: 'd1' }])]);
    expect(index!.noteTypes).toEqual([
      {
        id: '3',
        name: 'Tipo 3',
        kind: 'normal',
        occlusion: false,
        fields: PHOTO.fields,
        templates: ['Tarjeta 1'],
        sortField: 0,
      },
    ]);
  });

  it('orders by code (plain byte order), notes with a code before those without, ties by guid', () => {
    const one = { ord: 0, deckId: 'd1' };
    const [index] = build([
      note('g2', '1', {}, [one], { code: null }),
      note('g1', '1', {}, [one], { code: null }),
      note('h', '1', {}, [one], { code: 'T-B' }),
      note('i', '1', {}, [one], { code: 'T-A' }),
      note('k2', '1', {}, [one], { code: 'T-A' }),
      note('g0', '1', {}, [one], { code: null }),
      note('k1', '1', {}, [one], { code: 'T-A' }),
      note('j', '1', {}, [one], { code: 'T-a' }),
    ]);
    expect(index!.notes.map((n) => n.guid)).toEqual(['i', 'k1', 'k2', 'h', 'j', 'g0', 'g1', 'g2']);
  });
});
