// Tests for the catalog read: the deck tree paged past 1000 rows, counts an old database lacks, and the missing indexes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
import type { Answer, Asked } from '../../../test/contentClient';
import { readCatalog } from '../catalog';

const NOTE = {
  id: 'AP-BC-C2-01',
  slug: 'uno',
  course_id: 'curso',
  assessment_id: 'curso/c1',
  kind: 'lecture',
  title: 'Uno',
  subtitle: null,
  position: 1,
  updated_at: '2026-10-31T12:00:00+00:00',
  code: null,
  version: 1,
  published_at: null,
  version_at: null,
};

const deck = (n: number, over: Record<string, unknown> = {}) => ({
  id: String(n),
  name: `Mazo ${n}`,
  parent: null,
  preset: null,
  semester: 2,
  course_id: 'curso',
  assessment_id: 'curso/c1',
  note_count: 1,
  card_count: 2,
  ...over,
});

const answers = (tree: Answer | ((a: Asked) => Answer), indexes: Answer = ok([])) => ({
  'from:semesters': ok([{ number: 2, name: '2° Semestre' }]),
  'from:courses': ok([{ id: 'curso', semester: 2, name: 'Curso', emoji: '🧬', position: 1 }]),
  'from:assessments': ok([
    { id: 'curso/c1', course_id: 'curso', name: 'C1', position: 1, suggested_date: '2026-12-01' },
  ]),
  'from:notes': ok([NOTE]),
  'rpc:anki_deck_tree': tree,
  'from:anki_presets': ok([{ name: 'Default', config: { new: { perDay: 20 } } }]),
  'from:anki_note_types': ok([
    {
      id: '1',
      name: 'Básica',
      kind: 'normal',
      occlusion: false,
      fields: ['Frente'],
      templates: [{ name: 'Directa' }],
      sort_field: 0,
    },
  ]),
  'from:quizzes': ok([]),
  'rpc:anki_browse_indexes': indexes,
});

let errors: unknown[][];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => {
    errors.push(a);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('readCatalog', () => {
  it('nests what the tables and functions give, renaming the columns', async () => {
    const { db: client } = fakeContentClient(answers(ok([deck(1)])));
    const catalog = await readCatalog(client);
    expect(catalog.anki.noteTypes).toEqual([
      expect.objectContaining({ id: '1', templates: ['Directa'], sortField: 0 }),
    ]);
    expect(catalog.anki.decks).toEqual([
      expect.objectContaining({ id: '1', courseId: 'curso', assessmentId: 'curso/c1' }),
    ]);
    expect(errors).toEqual([]);
  });

  it('the deck tree is asked 1000 rows at a time until a page comes short', async () => {
    const page = (from: number, size: number) =>
      Array.from({ length: size }, (_, i) => deck(from + i));
    const { db: client, calls } = fakeContentClient(
      answers((a) => ok(a.range![0] === 0 ? page(0, 1000) : page(1000, 3))),
    );
    const catalog = await readCatalog(client);
    expect(catalog.anki.decks).toHaveLength(1003);
    expect(calls.filter((c) => c.range).map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('a page of exactly 1000 makes it ask once more, and a function that says null is an empty page', async () => {
    const { db: client, calls } = fakeContentClient(
      answers((a) =>
        ok(a.range![0] === 0 ? Array.from({ length: 1000 }, (_, i) => deck(i)) : null),
      ),
    );
    expect((await readCatalog(client)).anki.decks).toHaveLength(1000);
    expect(calls.filter((c) => c.range)).toHaveLength(2);
  });

  it('an error of the tree is the error of the catalog, with the page that failed not hidden', async () => {
    const { db: client } = fakeContentClient(answers(failed('sin permiso')));
    await expect(readCatalog(client)).rejects.toThrow('Content database (decks): sin permiso');
  });

  it('the counts a database before the migration does not send are left out, not zeroed', async () => {
    const { db: client } = fakeContentClient(
      answers(
        ok([
          deck(1),
          deck(2, { own_note_count: 0, exclusive_note_count: 1, closed_note_count: 2 }),
        ]),
      ),
    );
    const [old, current] = (await readCatalog(client)).anki.decks;
    expect(old).not.toHaveProperty('ownNoteCount');
    expect(old).not.toHaveProperty('exclusiveNoteCount');
    expect(old).not.toHaveProperty('closedNoteCount');
    expect(current).toMatchObject({ ownNoteCount: 0, exclusiveNoteCount: 1, closedNoteCount: 2 });
  });

  it('a database without the indexes function still has a catalog, and says so in the log', async () => {
    const { db: client } = fakeContentClient(answers(ok([]), failed('no existe')));
    const catalog = await readCatalog(client);
    expect(catalog.anki.decks).toEqual([]);
    expect(String(errors[0]?.[0])).toBe('Content database (browse indexes): no existe');
  });

  it('indexes that come as null are none', async () => {
    const { db: client } = fakeContentClient(answers(ok([]), ok(null)));
    await expect(readCatalog(client)).resolves.toBeDefined();
    expect(errors).toEqual([]);
  });
});
