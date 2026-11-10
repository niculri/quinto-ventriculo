import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayStartsAt } from '@qv/srs';
import type { AnkiTreeDeck, CardSummary } from '@qv/schema';
import { deckCounts } from '../study/DeckCounts';
import { masteryByDeck } from '../study/mastery';
import { defaultPreferences, localStudyRepository } from '../study/repository';
import type { StoredCard } from '../study/repository';
import { blankRow } from '../study/session';
import { cardKey, timingFor } from '../study/scheduler';
import type { StudyData, TreeDeck } from '../study/scheduler';
import { EMPTY_PLAN } from '../study/simple';
import { decayByDeck, homeCourseCounts, nextChangeAt } from './counts';

/** A small deterministic generator (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.parse('2026-11-09T15:00:00Z');
const MIN = 60_000;
const DAY = 86_400_000;
const COURSE = '3';

/**
 * A course as the published ones: root → semester → course → assessment → weeks → decks with their Extras, notes of
 * one to four cards (some with a card in the Extras), and a student with rows of every kind.
 */
function scenario(seed: number) {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const decks: TreeDeck[] = [];
  const add = (id: string, name: string, parentId: string | null, preset = 'Default') =>
    decks.push({ id, name, label: name.split('::').at(-1)!, parentId, authorPreset: preset });
  add('1', 'R', null);
  add('2', 'R::S1', '1');
  add(COURSE, 'R::S1::C', '2');
  add('4', 'R::S1::C::A', COURSE);
  for (const w of [1, 2]) {
    add(`5${w}`, `R::S1::C::A::W${w}`, '4');
    for (const d of [1, 2]) {
      add(`6${w}${d}`, `R::S1::C::A::W${w}::D${d}`, `5${w}`);
      add(`7${w}${d}`, `R::S1::C::A::W${w}::D${d}::Extras`, `6${w}${d}`, 'Extras');
    }
  }
  const topics = decks.filter((d) => d.name.split('::').length === 6).map((d) => d.id);
  const cards: CardSummary[] = [];
  const notes = 4 + Math.floor(rnd() * 70);
  for (let i = 0; i < notes; i++) {
    const topic = pick(topics);
    const extras = `7${topic.slice(1)}`;
    const size = 1 + Math.floor(rnd() * 4);
    const where = rnd();
    for (let ord = 0; ord < size; ord++) {
      // A note all in its deck, all in its Extras, or split between them.
      const deckId = where < 0.6 ? topic : where < 0.8 ? extras : ord % 2 ? extras : topic;
      cards.push({
        noteGuid: `n${String(i).padStart(3, '0')}`,
        ord,
        deckId,
        code: null,
        version: null,
        kind: 'basic',
        text: '',
      });
    }
  }
  const seenShare = pick([0, 0.1, 0.4, 0.8, 1]);
  const rows = new Map<string, StoredCard>();
  for (const c of cards) {
    if (rnd() > seenShare) continue;
    const kind = pick(['review', 'review', 'learn', 'dayLearn', 'forgotten', 'later']);
    const base = { ...blankRow(c), stability: 1 + rnd() * 20, difficulty: 5, reps: 2 };
    const lastReview = new Date(NOW - Math.floor(rnd() * 20) * DAY).toISOString();
    let row: StoredCard;
    if (kind === 'forgotten') row = { ...blankRow(c) };
    else if (kind === 'learn') {
      row = {
        ...base,
        phase: 'learning',
        due: new Date(NOW + (rnd() * 60 - 30) * MIN).toISOString(),
        lastReview,
      };
    } else {
      const days = kind === 'later' ? 1 + Math.floor(rnd() * 10) : -Math.floor(rnd() * 4);
      const day = timingFor(defaultPreferences('America/Santiago'), NOW).today + days;
      row = {
        ...base,
        phase: kind === 'dayLearn' ? 'learning' : 'review',
        interday: true,
        due: new Date(dayStartsAt(day, 'America/Santiago', 4) * 1000).toISOString(),
        interval: 4,
        lastReview,
      };
    }
    if (rnd() < 0.08) row.suspended = true;
    if (rnd() < 0.05) row.buriedUntil = new Date(NOW + 5 * 3600_000).toISOString();
    rows.set(cardKey(c), row);
  }
  // Each deck's own cards, as treeDecks() leaves them.
  const own = new Map<string, number>();
  for (const c of cards) own.set(c.deckId, (own.get(c.deckId) ?? 0) + 1);
  for (const d of decks) d.ownCards = own.get(d.id) ?? 0;
  const full = rnd() < 0.3;
  const units = decks.filter((d) => d.name.split('::').length === 5);
  const data: StudyData = {
    deck: {
      id: COURSE,
      name: 'C',
      fullName: 'R::S1::C',
      description: '',
      courseId: null,
      assessmentId: null,
      preset: 'Default',
      noteCount: notes,
      cardCount: cards.length,
      subdecks: decks
        .filter((d) => d.name.startsWith('R::S1::C::'))
        .map((d) => ({
          id: d.id,
          name: d.label,
          parentId: d.parentId,
          preset: d.authorPreset,
          cardCount: 0,
        })),
      cards,
      presets: [],
    },
    decks,
    authorPresets: [
      {
        name: 'Default',
        config: { new: { perDay: pick([3, 10, 20, 50]) }, rev: { perDay: pick([5, 200]) } },
      },
      { name: 'Extras', config: { new: { perDay: 0 }, rev: { perDay: 4 } } },
    ],
    rows,
    answers: rnd() < 0.5 ? [{ deckId: '611', queueBefore: 'new' }] : [],
    prefs: { ...defaultPreferences('America/Santiago'), fullAnki: full },
    presets: [],
    settings: [],
    plan: {
      ...EMPTY_PLAN,
      activations: units.filter(() => rnd() < 0.7).map((d) => ({ deckId: d.id, active: true })),
      assessments: [
        {
          deckId: '4',
          includeExtras: rnd() < 0.4,
          newPerDay: pick([null, 2, 5, 15, 40]),
          // Some with a date: then the siblings come out too.
          examDate: rnd() < 0.25 ? '2026-11-25' : null,
        },
      ],
    },
    progress: [],
  };
  return { data, cards };
}

/** The catalog's figures of each deck, as anki_deck_tree() gives them. */
function catalogOf(data: StudyData, cards: CardSummary[]): AnkiTreeDeck[] {
  return data.decks.map((d) => {
    const mine = cards.filter((c) => c.deckId === d.id);
    const below = data.decks.filter((x) => x.name === d.name || x.name.startsWith(`${d.name}::`));
    const notes = new Set(mine.map((c) => c.noteGuid));
    return {
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      preset: d.authorPreset,
      semester: null,
      courseId: null,
      assessmentId: null,
      noteCount: 0,
      cardCount: 0,
      ownNoteCount: notes.size,
      exclusiveNoteCount: [...notes].filter((n) =>
        cards.filter((c) => c.noteGuid === n).every((c) => c.deckId === d.id),
      ).length,
      closedNoteCount: [...notes].filter((n) =>
        cards.filter((c) => c.noteGuid === n).every((c) => below.some((x) => x.id === c.deckId)),
      ).length,
    };
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('«Hoy» without the deck', () => {
  it('when it gives a number, it is the study screen’s; the dominio is always the same', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    let exact = 0;
    let unknown = 0;
    for (let seed = 1; seed <= Number(process.env.QV_SEEDS ?? 300); seed++) {
      const { data, cards } = scenario(seed);
      const store = new Map<string, string>();
      const storage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      } as unknown as Storage;
      storage.setItem('qv-demo-study', JSON.stringify({ cards: [...data.rows.values()] }));
      const repo = localStudyRepository(storage);
      const { deck: _deck, rows: _rows, ...base } = data;
      const ids = data.decks.map((d) => d.id);
      const today = timingFor(data.prefs, NOW).today;
      const until = new Date(dayStartsAt(today + 1, 'America/Santiago', 4) * 1000);
      const home = await repo.homeCounts(ids, until, decayByDeck(base, ids, NOW));
      const result = homeCourseCounts(
        base,
        COURSE,
        catalogOf(data, cards),
        new Map(home.decks.map((d) => [d.deckId, d])),
        NOW,
      );
      const real = deckCounts(data, NOW).get(COURSE)!;
      expect(result.mastery).toBeCloseTo(masteryByDeck(data, NOW).get(COURSE)!, 9);
      if (result.counts) {
        exact++;
        expect([seed, result.counts]).toEqual([seed, real]);
      } else unknown++;
    }
    // Most of the time it knows; when not, the row reads the deck.
    if (process.env.QV_SEEDS) console.log('exact', exact, 'unknown', unknown);
    expect(exact).toBeGreaterThan(150);
    expect(unknown).toBeGreaterThan(0);
  });

  it('a student who just arrived: almost always without the deck', () => {
    let exact = 0;
    for (let seed = 1; seed <= Number(process.env.QV_SEEDS ?? 300); seed++) {
      const { data, cards } = scenario(seed);
      const fresh: StudyData = { ...data, rows: new Map(), answers: [] };
      const { deck: _deck, rows: _rows, ...base } = fresh;
      const result = homeCourseCounts(base, COURSE, catalogOf(fresh, cards), new Map(), NOW);
      expect(result.mastery).toBe(0);
      if (!result.counts) continue;
      exact++;
      expect([seed, result.counts]).toEqual([seed, deckCounts(fresh, NOW).get(COURSE)!]);
    }
    // These courses are tiny (4 to 74 notes, a fifth with a card in the Extras): with real ones it is always.
    if (process.env.QV_SEEDS) console.log('fresh exact', exact);
    expect(exact).toBeGreaterThan(200);
  });

  it('without the catalog’s notes (a content database before step 3.2) it never guesses', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { data, cards } = scenario(seed);
      const { deck: _deck, rows: _rows, ...base } = data;
      const catalog = catalogOf(data, cards).map(
        ({ ownNoteCount: _o, exclusiveNoteCount: _e, closedNoteCount: _c, ...d }) => d,
      );
      const result = homeCourseCounts(base, COURSE, catalog, new Map(), NOW);
      if (result.counts) {
        expect(result.counts.new).toBe(
          deckCounts({ ...data, rows: new Map() }, NOW).get(COURSE)!.new,
        );
      }
    }
  });

  it('the next change is a learning step coming within the learn-ahead limit', () => {
    const due = (queue: 'l' | 'r', at: number) => ({
      noteGuid: 'n',
      ord: 0,
      queue,
      due: at / 1000,
    });
    const home = new Map([
      [
        'd',
        {
          deckId: 'd',
          seen: 3,
          hiddenNew: 0,
          touched: 3,
          suspended: 0,
          recall: 1,
          due: [due('l', NOW + 30 * MIN), due('l', NOW + 5 * MIN), due('r', NOW - DAY)],
        },
      ],
    ]);
    expect(nextChangeAt(home, 20, NOW)).toBe(NOW + 10 * MIN);
    expect(nextChangeAt(home, 40, NOW)).toBeNull();
  });
});
