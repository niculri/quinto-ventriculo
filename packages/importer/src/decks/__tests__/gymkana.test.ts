// The synthetic gymkana through buildDecks: its deck found by name, the regions and sources of its entry, the warnings
// of what the writing mode would miss, and the card browser's index that carries it to the web.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readApkgFile } from '@qv/anki-format';
import type { AnkiPackage } from '@qv/anki-format';
import { buildDecks } from '../buildDecks';
import { buildCardIndexes } from '../cardIndex';
import { gymkanaOf, gymkanaWarnings } from '../gymkana';
import type { DecksManifest } from '../../manifest/schemas';
import type { ImportError } from '../../ImportError';

const GYMKANA = join(import.meta.dirname, '../../../../anki-format/test/fixtures/gymkana.apkg');
const DECK_ID = '2059400120';
const assessment = {
  id: 'anatomia-2/certamen-2',
  courseId: 'anatomia-2',
  name: 'Certamen 2',
  position: 2,
};
const place = {
  semesterNumber: 2,
  courseId: 'anatomia-2',
  assessmentId: assessment.id,
  expected: ['() Medicina UCH', '2° Semestre', '🦴 Anatomía II', 'Certamen 2'],
};
const PLACES = {
  regions: [
    { tag: 'orbita', label: 'Órbita' },
    { tag: 'cuello', label: 'Cuello' },
  ],
  sources: [{ label: 'Atlas A', tags: ['atlas_a'] }],
};

type Entry = DecksManifest['decks'][number];

async function run(entry: Partial<Entry>, edit: (pkg: AnkiPackage) => void = () => {}) {
  const pkg = await readApkgFile(GYMKANA);
  edit(pkg);
  return buildDecks({
    manifests: [{ assessmentId: assessment.id, decks: [{ apkg: 'gymkana.apkg', ...entry }] }],
    assessments: new Map([[assessment.id, assessment]]),
    courses: [{ id: 'anatomia-2', semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 }],
    semesters: [{ number: 2, name: '2° Semestre' }],
    root: '/x',
    process: async (data) => ({
      key: `cards/${String(data.length).padStart(32, '0')}.webp`,
      read: async () => Buffer.from(data),
      width: 1,
      height: 1,
      contentType: 'image/webp' as const,
    }),
    read: async () => pkg,
  });
}

describe('a gymkana package', () => {
  it('gives the deck its regions and sources, and says what its notes lack', async () => {
    const r = await run({ gymkana: PLACES });
    expect(r.gymkanas).toEqual([{ deckId: DECK_ID, ...PLACES }]);
    expect(r.warnings).toEqual([
      'gymkana.apkg: 2 estación(es) de la gymkana sin región.',
      'gymkana.apkg: 2 estación(es) de la gymkana sin fuente.',
    ]);
    const [index] = buildCardIndexes({
      noteTypes: r.noteTypes,
      decks: r.decks,
      notes: r.notes.map((n) => ({ ...n, hash: 'h', updatedAt: '2026-11-24T00:00:00.000Z' })),
      gymkanas: [...r.gymkanas, { deckId: '1', regions: [], sources: [] }],
    });
    expect(index!.gymkanas).toEqual([{ deckId: DECK_ID, ...PLACES }]);
    expect(index!.notes.every((n) => n.kind === 'photo')).toBe(true);
  });

  it('without «gymkana» in its entry, is still one, without regions or sources', async () => {
    const r = await run({}, (pkg) => {
      pkg.collection.notes[0]!.fields[4] = ' ';
    });
    expect(r.gymkanas).toEqual([{ deckId: DECK_ID, regions: [], sources: [] }]);
    expect(r.warnings).toEqual([
      'gymkana.apkg: el mazo «Gymkana» no trae «gymkana» en content/decks/: escribir el nombre no tendrá regiones ni fuentes.',
      'gymkana.apkg: 1 estación(es) de la gymkana sin «Etiqueta» (no se preguntan al escribir el nombre).',
    ]);
  });

  it('with «gymkana» in the entry of a package without that deck, stops', async () => {
    const e = (await run({ gymkana: PLACES }, (pkg) => {
      for (const d of pkg.collection.decks) d.name = d.name.replace('Gymkana', 'S4 - Semana');
    }).catch((x: unknown) => x)) as ImportError;
    expect(e.kind).toBe('manifest');
    expect(e.message).toContain('su entrada trae «gymkana», pero el paquete no tiene el mazo');
  });

  it('another deck is no gymkana', async () => {
    const r = await run({}, (pkg) => {
      for (const d of pkg.collection.decks) d.name = d.name.replace('Gymkana', 'S4 - Semana');
    });
    expect(r.gymkanas).toEqual([]);
  });
});

describe('gymkanaOf and gymkanaWarnings', () => {
  it('find the deck by its full name and count only the notes of that deck', () => {
    const decks = [{ id: '7', name: `${place.expected.join('::')}::Gymkana` }];
    const meta = gymkanaOf('x', { apkg: 'x.apkg' }, place, decks)!;
    expect(meta).toEqual({ deckId: '7', regions: [], sources: [] });
    const note = (deckId: string, Etiqueta?: string) => ({
      guid: deckId,
      noteTypeId: '1',
      fields: Etiqueta === undefined ? {} : { Etiqueta },
      tags: [],
      code: null,
      version: null,
      createdAt: null,
      cards: [{ ord: 0, deckId, frontHtml: '', backHtml: '', sortField: '' }],
      media: [],
    });
    expect(gymkanaWarnings(meta, [note('7'), note('8'), note('7', 'Nervio')], true)).toEqual([
      '1 estación(es) de la gymkana sin «Etiqueta» (no se preguntan al escribir el nombre).',
    ]);
  });
});
