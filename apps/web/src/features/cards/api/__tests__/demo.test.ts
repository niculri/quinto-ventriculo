// Tests the made-up cards of the demo mode: the same index for the same seed, in the assessment's lecture decks, each
// kind with its cards and fields, the student's made-up rows, and the API and study wrapped only while the browser asks.
import type { AnkiTreeDeck, CardIndexNote } from '@qv/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../../test/fakes/api';
import { CARD_INDEX, CARDS } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { storedCard } from '../../../../test/fixtures/storedCard';
import type { StudyRepository } from '../../../progress/api/repository';
import { syntheticIndex, syntheticRows, withDemoCards } from '../demo';

const deck = (
  id: string,
  name: string,
  parentId: string | null,
  assessmentId = 'a/c1',
): AnkiTreeDeck => ({
  id,
  name,
  parentId,
  preset: 'Default',
  semester: 1,
  courseId: 'a',
  assessmentId,
  noteCount: 0,
  cardCount: 0,
});
// P is a week (it has a lecture below it), L1 a lecture with its Extras, L2 a lecture without them.
const DECKS = [
  deck('P', 'R::C::P', null),
  deck('L1', 'R::C::P::L1', 'P'),
  deck('E1', 'R::C::P::L1::Extras', 'L1'),
  deck('L2', 'R::C::P::L2', 'P'),
  deck('X', 'R::Otro', null, 'otro/c1'),
];

const firstOf = (notes: CardIndexNote[], kind: CardIndexNote['kind']) => {
  const n = notes.find((x) => x.kind === kind);
  if (!n) throw new Error(`no ${kind} note`);
  return n;
};

describe('the made-up index', () => {
  it('is the same for the same seed and another for another seed', () => {
    expect(syntheticIndex('a/c1', DECKS, 40)).toEqual(syntheticIndex('a/c1', DECKS, 40));
    expect(syntheticIndex('a/c1', DECKS, 40, 8)).not.toEqual(syntheticIndex('a/c1', DECKS, 40));
  });

  it('is empty for an assessment without decks', () => {
    expect(syntheticIndex('nada/c1', DECKS, 40)).toEqual({
      version: CARD_INDEX.version,
      assessmentId: 'nada/c1',
      noteTypes: [],
      notes: [],
    });
  });

  it('splits the notes among the lectures in order, with a fifth or so in a lecture’s Extras', () => {
    const { notes } = syntheticIndex('a/c1', DECKS, 200);
    expect(notes).toHaveLength(200);
    const decksOf = (ns: CardIndexNote[]) =>
      new Set(ns.flatMap((n) => n.cards.map((c) => c.deckId)));
    expect(decksOf(notes.slice(0, 100))).toEqual(new Set(['L1', 'E1']));
    expect(decksOf(notes.slice(100))).toEqual(new Set(['L2']));
    const extras = notes
      .slice(0, 100)
      .flatMap((n) => n.cards)
      .filter((c) => c.deckId === 'E1');
    const all = notes.slice(0, 100).flatMap((n) => n.cards);
    expect(extras.length / all.length).toBeGreaterThan(0.1);
    expect(extras.length / all.length).toBeLessThan(0.3);
  });

  it('gives each kind its cards: two holes, one card, or one per label of an occlusion', () => {
    const { notes } = syntheticIndex('a/c1', DECKS, 300);
    for (const n of notes) {
      const ords = n.cards.map((c) => c.ord);
      if (n.kind === 'cloze') expect(ords).toEqual([0, 1]);
      else if (n.kind === 'occlusion') {
        expect(ords.length).toBeGreaterThanOrEqual(2);
        expect(ords.length).toBeLessThanOrEqual(11);
        expect(n.labels).toBe(ords.length);
      } else expect(ords).toEqual([0]);
      if (n.kind !== 'occlusion') expect(n.labels).toBe(0);
    }
    expect(new Set(notes.map((n) => n.kind))).toEqual(
      new Set(['basic', 'cloze', 'occlusion', 'photo']),
    );
  });

  it('writes each note’s fields, sort field, topic, code and made-up guid', () => {
    const { notes, noteTypes } = syntheticIndex('a/c1', DECKS, 300);
    const basic = firstOf(notes, 'basic');
    expect(basic.fields).toEqual([basic.topic, basic.front, basic.back]);
    expect(basic.sortField).toBe(basic.front);
    const cloze = firstOf(notes, 'cloze');
    expect(cloze.fields[1]).not.toMatch(/\{\{|\}\}|::/);
    expect(cloze.sortField).toBe(cloze.fields[1]);
    const occlusion = firstOf(notes, 'occlusion');
    expect(occlusion.fields).toEqual([occlusion.front, '']);
    expect(occlusion.topic).toBe(occlusion.front);
    expect(occlusion.sortField).toBe(occlusion.front);
    const photo = firstOf(notes, 'photo');
    expect(photo.fields).toEqual([photo.front, '', '', photo.back]);
    expect(photo.topic).toBe(photo.front);
    expect(notes[0]!.guid).toBe('demo-a/c1-0');
    expect(notes[11]!.code).toBe('T-DM-01-0012');
    expect(noteTypes.map((t) => [t.id, t.kind, t.occlusion, t.templates[0]])).toEqual([
      ['-91', 'normal', false, 'Directa'],
      ['-92', 'cloze', false, 'Cloze'],
      ['-93', 'cloze', true, 'Cloze'],
      ['-94', 'normal', false, 'Directa'],
    ]);
    for (const n of notes) expect(noteTypes.some((t) => t.id === n.noteTypeId)).toBe(true);
  });

  it('keeps a topic for seven notes in a row', () => {
    const { notes } = syntheticIndex('a/c1', DECKS, 21);
    const topicOf = (n: CardIndexNote) =>
      n.kind === 'basic' || n.kind === 'cloze' ? n.topic : null;
    for (const block of [notes.slice(0, 7), notes.slice(7, 14), notes.slice(14)]) {
      expect(new Set(block.map(topicOf).filter((t) => t !== null)).size).toBeLessThanOrEqual(1);
    }
  });
});

describe('the made-up rows', () => {
  const NOW = Date.UTC(2026, 10, 1);
  const index = syntheticIndex('a/c1', DECKS, 300);

  it('are the same for the same seed, for a part of the cards, due in the next twenty days', () => {
    const rows = syntheticRows(index, NOW);
    expect(syntheticRows(index, NOW)).toEqual(rows);
    const cards = index.notes.reduce((t, n) => t + n.cards.length, 0);
    expect(rows.length / cards).toBeGreaterThan(0.35);
    expect(rows.length / cards).toBeLessThan(0.55);
    for (const r of rows) {
      const days = (Date.parse(r.due!) - NOW) / 86_400_000;
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(20);
      expect(r.lastReview).toBe(new Date(NOW - 2 * 86_400_000).toISOString());
    }
  });

  it('have some hard cards, flagged and suspended ones', () => {
    const rows = syntheticRows(index, NOW);
    const hard = rows.filter((r) => r.lapses === 3);
    expect(hard.length).toBeGreaterThan(0);
    for (const r of hard) expect(r).toMatchObject({ stability: 1.2, difficulty: 9, reps: 6 });
    expect(rows.some((r) => r.flag === 1)).toBe(true);
    expect(rows.some((r) => r.suspended)).toBe(true);
  });
});

const REAL_ROW = storedCard('s@/AqX%n?#', 0, '20');

function wrapped(count: number | null) {
  const catalog = vi.fn(fakeApi().catalog);
  const card = vi.fn(fakeApi().card);
  const cardIndex = vi.fn(fakeApi().cardIndex);
  const api = fakeApi({ catalog, card, cardIndex });
  const cards = vi.fn(async () => [REAL_ROW]);
  const study = { cards } as unknown as StudyRepository;
  let n = count;
  const demo = withDemoCards(api, study, () => n);
  return { demo, catalog, card, cardIndex, cards, setCount: (x: number | null) => (n = x) };
}

describe('the demo mode’s API and study', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('are the real ones while the browser does not ask for made-up cards', async () => {
    const { demo, card, cardIndex } = wrapped(null);
    expect(await demo.api.catalog()).toBe(CATALOG);
    await expect(demo.api.cardIndex('anatomia-1/certamen-1', 'x')).rejects.toThrow();
    expect(cardIndex).toHaveBeenCalledWith('anatomia-1/certamen-1', 'x', undefined);
    expect(await demo.api.card('cloze-1', 0)).toEqual(CARDS['cloze-1/0']);
    expect(card).toHaveBeenCalledTimes(1);
    expect(await demo.study.cards(['20'])).toEqual([REAL_ROW]);
  });

  it('give an index to every assessment with decks, and leave the others as they are', async () => {
    const { demo } = wrapped(30);
    const c = await demo.api.catalog();
    const [anatomy, biology] = c.semesters.map((s) => s.courses[0]!.assessments[0]!);
    expect(anatomy!.cardIndex).toEqual({
      hash: '0'.repeat(32),
      noteCount: 0,
      cardCount: 0,
      bytes: 0,
    });
    expect(biology).toBe(CATALOG.semesters[1]!.courses[0]!.assessments[0]);
  });

  it('make the index once per assessment and count, reading the catalog once', async () => {
    const { demo, catalog, setCount } = wrapped(30);
    const first = await demo.api.cardIndex('anatomia-1/certamen-1', 'h');
    expect(first.notes).toHaveLength(30);
    expect(await demo.api.cardIndex('anatomia-1/certamen-1', 'otro')).toBe(first);
    setCount(12);
    expect((await demo.api.cardIndex('anatomia-1/certamen-1', 'h')).notes).toHaveLength(12);
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it('show a made-up card by its kind, and ask the API for any card it did not make', async () => {
    const { demo, card } = wrapped(300);
    const { notes } = await demo.api.cardIndex('anatomia-1/certamen-1', 'h');
    const cloze = firstOf(notes, 'cloze');
    const shownCloze = await demo.api.card(cloze.guid, 1);
    expect(shownCloze).toMatchObject({
      noteGuid: cloze.guid,
      ord: 1,
      kind: 'cloze',
      code: cloze.code,
    });
    expect(shownCloze.deckId).toBe(cloze.cards[1]!.deckId);
    expect(shownCloze.front).toMatch(/\[…\].*\[estructura\]/);
    expect(shownCloze.back).toMatch(
      /<div class="respuesta">El .* <b>[^<]+<\/b> se continúa con el <b>[^<]+<\/b>/,
    );
    const basic = firstOf(notes, 'basic');
    expect((await demo.api.card(basic.guid, 0)).back).toContain(
      `<div class="respuesta">${basic.back}</div>`,
    );
    const photo = firstOf(notes, 'photo');
    const shownPhoto = await demo.api.card(photo.guid, 0);
    expect(shownPhoto.kind).toBe('basic');
    expect(shownPhoto.back).toContain(`<div class="respuesta">${photo.back}</div>`);
    const occlusion = firstOf(notes, 'occlusion');
    const shownOcclusion = await demo.api.card(occlusion.guid, 1);
    expect(shownOcclusion.kind).toBe('basic');
    expect(shownOcclusion.front).toBe(`<div class="pregunta">${occlusion.front}</div>`);
    expect(shownOcclusion.back).toContain('<div class="respuesta">Rótulo 2</div>');
    expect(card).not.toHaveBeenCalled();
    await expect(demo.api.card(basic.guid, 5)).rejects.toThrow();
    await expect(demo.api.card('demo-nada', 0)).rejects.toThrow();
    expect(await demo.api.card('cloze-1', 0)).toEqual(CARDS['cloze-1/0']);
    expect(card).toHaveBeenCalledTimes(3);
  });

  it('add the made-up rows of the asked decks to the student’s, without repeating a card the student has', async () => {
    const { demo } = wrapped(300);
    const rows = await demo.study.cards(['20', '21']);
    expect(rows[0]).toBe(REAL_ROW);
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((r) => r.deckId))).toEqual(new Set(['20', '21']));
    const keys = rows.map((r) => `${r.noteGuid}/${r.ord}`);
    expect(new Set(keys).size).toBe(keys.length);
    const only20 = await demo.study.cards(['20']);
    expect(only20.every((r) => r.deckId === '20')).toBe(true);
  });

  it('do not repeat a made-up card the student already answered', async () => {
    const { demo, cards } = wrapped(300);
    const made = (await demo.study.cards(['20'])).find((r) => r.noteGuid.startsWith('demo-'))!;
    const answered = storedCard(made.noteGuid, made.ord, made.deckId, { reps: 99 });
    cards.mockResolvedValueOnce([answered]);
    const rows = await demo.study.cards(['20']);
    expect(rows.filter((r) => r.noteGuid === made.noteGuid && r.ord === made.ord)).toEqual([
      answered,
    ]);
  });

  it('take the count from this browser: a whole number above zero, at most 20 000', async () => {
    const api = fakeApi();
    const study = { cards: async () => [] } as unknown as StudyRepository;
    const indexWith = async (value: string | null) => {
      if (value === null) localStorage.removeItem('qv-demo-cards');
      else localStorage.setItem('qv-demo-cards', value);
      const demo = withDemoCards(api, study);
      return (await demo.api.catalog()) === CATALOG
        ? null
        : (await demo.api.cardIndex('anatomia-1/certamen-1', 'h')).notes.length;
    };
    expect(await indexWith('5')).toBe(5);
    for (const v of [null, '', '0', '-3', '2.5', 'muchas']) expect(await indexWith(v)).toBeNull();
    expect(await indexWith('999999')).toBe(20_000);
  });

  it('are the real ones when this browser’s storage cannot be read', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    const demo = withDemoCards(fakeApi(), {
      cards: async () => [REAL_ROW],
    } as unknown as StudyRepository);
    expect(await demo.api.catalog()).toBe(CATALOG);
    expect(await demo.study.cards(['20'])).toEqual([REAL_ROW]);
  });
});
