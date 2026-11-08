// Plan step 1.3: cards the author moves to another deck or takes out while students have progress in them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayStartsAt } from '@qv/srs';
import type { AnkiTreeDeck, CardChanges, CardSummary, DeckDetail } from '@qv/schema';
import { dropCurrent, startRound } from './final-review';
import { assessmentView, dateOfDay } from './pace';
import { defaultPreferences, localStudyRepository, supabaseStudyRepository } from './repository';
import type { CardChange, StudyRepository } from './repository';
import { cardKey, timingFor, treeDecks } from './scheduler';
import type { StudyData } from './scheduler';
import { StudySession } from './session';
import { EMPTY_PLAN } from './simple';
import type { StudyPlan } from './simple';
import { syncCards, withCardSync } from './sync';
import type { CardChangeSource } from './sync';

const NOW = Date.parse('2026-11-01T15:00:00Z');
const DAY = 86_400_000;
const PREFS = { ...defaultPreferences('America/Santiago'), welcomeSeen: true };
const TODAY = timingFor(PREFS, NOW).today;

const ASSESSMENT = '4';
const L1 = '51';
const L2 = '52';

const card = (deckId: string, guid: string): CardSummary => ({
  noteGuid: guid,
  ord: 0,
  deckId,
  code: null,
  version: null,
  kind: 'basic',
  text: '',
});

/** The content as the API has it now: its cards, and what moved or left, numbered as the database numbers it. */
class Content implements CardChangeSource {
  cards: CardSummary[];
  private log: (CardChange & { id: number })[] = [];
  constructor(sizes: Record<string, number>) {
    this.cards = Object.entries(sizes).flatMap(([deckId, n]) =>
      Array.from({ length: n }, (_, i) => card(deckId, `${deckId}-${String(i).padStart(2, '0')}`)),
    );
  }
  move(guid: string, deckId: string) {
    this.cards = this.cards.map((c) => (c.noteGuid === guid ? { ...c, deckId } : c));
    this.record(guid, deckId);
  }
  takeOut(guid: string) {
    this.cards = this.cards.filter((c) => c.noteGuid !== guid);
    this.record(guid, null);
  }
  private record(noteGuid: string, deckId: string | null) {
    const id = (this.log.at(-1)?.id ?? 0) + 1;
    this.log = [
      ...this.log.filter((l) => l.noteGuid !== noteGuid),
      { noteGuid, ord: 0, deckId, id },
    ];
  }
  /** As `anki_card_changes_since()`, with pages of `pageSize`. */
  pageSize = 2000;
  async cardChanges(since: number): Promise<CardChanges> {
    const after = this.log.filter((l) => l.id > since);
    const page = after.slice(0, this.pageSize);
    return {
      changes: page.map(({ noteGuid, ord, deckId }) => ({ noteGuid, ord, deckId })),
      next: page.at(-1)?.id ?? since,
      latest: this.log.at(-1)?.id ?? 0,
      more: after.length > page.length,
    };
  }

  /** The catalog's tree (a deck's count with its subdecks') and a deck as `/api/decks/:id` gives it. */
  tree(): AnkiTreeDeck[] {
    const deck = (id: string, name: string, parentId: string | null): AnkiTreeDeck => ({
      id,
      name,
      parentId,
      preset: 'Default',
      courseId: 'c',
      assessmentId: null,
      semester: 1,
      noteCount: 0,
      cardCount: 0,
    });
    const list = [
      deck('1', 'R', null),
      deck('2', 'R::S', '1'),
      deck('3', 'R::S::C', '2'),
      deck(ASSESSMENT, 'R::S::C::A', '3'),
      deck(L1, 'R::S::C::A::L1', ASSESSMENT),
      deck(L2, 'R::S::C::A::L2', ASSESSMENT),
    ];
    for (const d of list) {
      const ids = new Set(
        list.filter((x) => x.name === d.name || x.name.startsWith(`${d.name}::`)).map((x) => x.id),
      );
      d.cardCount = this.cards.filter((c) => ids.has(c.deckId)).length;
    }
    return list;
  }
  deck(id: string): DeckDetail {
    const decks = this.tree();
    const root = decks.find((d) => d.id === id)!;
    const inside = decks.filter((d) => d.id === id || d.name.startsWith(`${root.name}::`));
    const ids = new Set(inside.map((d) => d.id));
    return {
      id,
      name: root.name,
      fullName: root.name,
      description: '',
      courseId: 'c',
      assessmentId: null,
      preset: 'Default',
      noteCount: 0,
      cardCount: 0,
      subdecks: inside
        .filter((d) => d.id !== id)
        .map((d) => ({
          id: d.id,
          name: d.name,
          parentId: d.parentId,
          preset: d.preset,
          cardCount: d.cardCount,
        })),
      cards: this.cards.filter((c) => ids.has(c.deckId)),
      presets: [],
    };
  }
}

/** What the study page loads (useStudyData), from what the repository gives. */
async function load(
  content: Content,
  study: StudyRepository,
  rootId: string,
  plan: Partial<StudyPlan>,
  now = Date.now(),
): Promise<StudyData> {
  const deck = content.deck(rootId);
  const today = timingFor(PREFS, now).today;
  const dayStart = new Date(dayStartsAt(today, PREFS.timeZone, PREFS.dayStartsAt) * 1000);
  const rows = await study.cards([deck.id, ...deck.subdecks.map((s) => s.id)]);
  return {
    deck,
    decks: treeDecks(content.tree()),
    authorPresets: [
      { name: 'Default', config: { new: { perDay: 20, bury: true }, rev: { perDay: 200 } } },
    ],
    rows: new Map(rows.map((r) => [cardKey(r), r])),
    answers: await study.answersSince(dayStart),
    prefs: PREFS,
    presets: [],
    settings: [],
    plan: { ...EMPTY_PLAN, ...plan },
    progress: await study.deckProgress(dayStart),
  };
}

/** Answers «Bien» to everything that comes out; how many were new. */
async function studyAll(session: StudySession, start: number) {
  let now = start;
  let fresh = 0;
  session.showNext();
  for (let i = 0; i < 500 && session.shown; i++) {
    if (session.shown.entry.kind === 'new') fresh++;
    session.reveal();
    session.answer(3);
    now += 8000;
    vi.setSystemTime(now);
  }
  await session.saved();
  return fresh;
}

/** The student enters: what the site does before reading their progress. */
const enter = (study: StudyRepository, content: Content) =>
  withCardSync(study, content, async () => 'ana');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a card that moved to another deck after it was seen', () => {
  const plan = { activations: [L1, L2].map((deckId) => ({ deckId, active: true })) };

  it('studying its new deck: it is not new, answering it does not stop the session, and it keeps its progress', async () => {
    const content = new Content({ [L1]: 3, [L2]: 2 });
    const local = localStudyRepository(null, PREFS);
    const first = new StudySession(await load(content, local, L1, plan), L1, local);
    await studyAll(first, NOW);
    const before = (await local.allCards()).find((r) => r.noteGuid === `${L1}-00`)!;
    expect(before.reps).toBeGreaterThan(0);

    // The author moves it (to «Extras», say); the next day the student opens the other lecture.
    content.move(`${L1}-00`, L2);
    vi.setSystemTime(NOW + DAY);
    const study = enter(local, content);
    const data = await load(content, study, L2, plan, NOW + DAY);
    expect(data.rows.get(cardKey({ noteGuid: `${L1}-00`, ord: 0 }))).toMatchObject({
      deckId: L2,
      reps: before.reps,
      stability: before.stability,
    });
    const session = new StudySession(data, L2, study);
    session.showNext();
    for (let i = 0; i < 20 && session.shown; i++) {
      if (session.shown.entry.noteGuid === `${L1}-00`) {
        expect(session.shown.entry.kind).not.toBe('new');
      }
      session.reveal();
      session.answer(3);
    }
    await session.saved();
    expect(session.failure).toBeNull();
  });
});

describe('with a date, everything still comes out in time after the author moves and takes out cards', () => {
  it('0 cards left unseen on the last day of new cards', async () => {
    const content = new Content({ [L1]: 30, [L2]: 20 });
    const local = localStudyRepository(null, PREFS);
    const plan = {
      activations: [L1, L2].map((deckId) => ({ deckId, active: true })),
      assessments: [
        {
          deckId: ASSESSMENT,
          includeExtras: false,
          newPerDay: 15,
          examDate: dateOfDay(TODAY + 10),
          finalReviewDays: 3,
          examDateSetAt: new Date(NOW).toISOString(),
        },
      ],
    };
    for (let day = 0; day <= 6; day++) {
      const now = NOW + day * DAY;
      vi.setSystemTime(now);
      if (day === 2) {
        // Seen cards move from one lecture to the other, unseen ones the other way, and two seen ones leave.
        const seen = (await local.allCards())
          .filter((r) => r.phase !== 'new')
          .map((r) => r.noteGuid);
        const seenL1 = seen.filter((g) => g.startsWith(L1));
        expect(seenL1.length).toBeGreaterThan(5);
        for (const g of seenL1.slice(0, 3)) content.move(g, L2);
        for (const g of seenL1.slice(3, 5)) content.takeOut(g);
        for (const c of content.cards.filter((x) => x.deckId === L2).slice(-2)) {
          content.move(c.noteGuid, L1);
        }
      }
      const study = enter(local, content);
      const data = await load(content, study, ASSESSMENT, plan, now);
      const view = assessmentView({
        decks: data.decks,
        plan: data.plan,
        progress: data.progress!,
        assessmentId: ASSESSMENT,
        today: timingFor(PREFS, now).today,
        prefs: PREFS,
      });
      // What the pace counts as left is what is really left to see.
      const rows = await study.allCards();
      const unseen = content.cards.filter(
        (c) => !rows.some((r) => r.noteGuid === c.noteGuid && r.phase !== 'new'),
      ).length;
      expect(view.facts.newLeft + (view.facts.newToday ?? 0), `day ${day}`).toBe(unseen);
      await studyAll(new StudySession(data, ASSESSMENT, study), now);
    }
    const rows = await local.allCards();
    const left = content.cards.filter(
      (c) => !rows.some((r) => r.noteGuid === c.noteGuid && r.phase !== 'new'),
    );
    expect(left).toEqual([]);
  });
});

describe('syncCards', () => {
  it('brings every page, and nothing when the cursor is up to date', async () => {
    const content = new Content({ [L1]: 5 });
    const local = localStudyRepository(null, PREFS);
    for (const c of content.cards) {
      await local.suspend([c], false);
    }
    content.pageSize = 2;
    content.move(`${L1}-00`, L2);
    content.move(`${L1}-01`, L2);
    content.takeOut(`${L1}-02`);
    expect(await syncCards(content, local)).toBe(3);
    expect(await local.cardsSyncedTo()).toBe(3);
    const rows = await local.allCards();
    expect(rows.filter((r) => r.deckId === L2).map((r) => r.noteGuid)).toEqual([
      `${L1}-00`,
      `${L1}-01`,
    ]);
    expect(rows.find((r) => r.noteGuid === `${L1}-02`)!.retiredAt).not.toBeNull();
    const calls = vi.spyOn(local, 'reconcileCards');
    expect(await syncCards(content, local)).toBe(0);
    expect(calls).not.toHaveBeenCalled();
  });

  it('another tab ahead: it goes on from where that one left it', async () => {
    const content = new Content({ [L1]: 2 });
    const local = localStudyRepository(null, PREFS);
    await local.suspend([content.cards[0]!], false);
    content.move(`${L1}-00`, L2);
    let first = true;
    const racing: StudyRepository = {
      ...local,
      // Another tab writes between this tab's read and its write.
      reconcileCards: async (input) => {
        if (first) {
          first = false;
          await local.reconcileCards({ ...input });
        }
        return local.reconcileCards(input);
      },
    };
    expect(await syncCards(content, racing)).toBe(0);
    expect((await local.allCards())[0]!.deckId).toBe(L2);
    expect(await local.cardsSyncedTo()).toBe(1);
  });

  it('a cursor past what the content has (it started again): from the beginning', async () => {
    const content = new Content({ [L1]: 1 });
    const local = localStudyRepository(null, PREFS);
    await local.reconcileCards({ since: 0, upTo: 40, changes: [] });
    await local.suspend([content.cards[0]!], false);
    content.move(`${L1}-00`, L2);
    expect(await syncCards(content, local)).toBe(1);
    expect(await local.cardsSyncedTo()).toBe(1);
  });

  it('once per visit and per user; a failure is tried again on the next read', async () => {
    const content = new Content({ [L1]: 1 });
    const local = localStudyRepository(null, PREFS);
    let user = 'ana';
    let fail = true;
    const source: CardChangeSource = {
      cardChanges: async (since) => {
        if (fail) {
          fail = false;
          throw new Error('sin conexión');
        }
        return content.cardChanges(since);
      },
    };
    const spy = vi.spyOn(source, 'cardChanges');
    const study = withCardSync(local, source, async () => user);
    await expect(study.cards([L1])).rejects.toThrow('sin conexión');
    await study.cards([L1]);
    await study.deckProgress(new Date(NOW));
    await study.answeredDecks();
    expect(spy).toHaveBeenCalledTimes(2);
    user = 'beto';
    await study.allCards();
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe('the final review', () => {
  it('a card taken out leaves the round, and the next one comes', () => {
    const [a, b] = [card(L1, 'a'), card(L1, 'b')];
    const round = dropCurrent({ ...startRound([a, b]), revealed: true });
    expect(round).toMatchObject({ queue: [b], total: 1, revealed: false });
  });
});

describe('a page that was behind (the users’ database)', () => {
  /** Just what the repository calls: the cursor row, and the functions (with the header each one got). */
  function fakeClient(row: { synced_to: number; repair_from: number | null } | null) {
    const calls: { fn: string; header: string | null }[] = [];
    const client = {
      from: () => ({
        select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      rpc: (fn: string, args: { p?: { upTo: number } }) => {
        const call = { fn, header: null as string | null };
        calls.push(call);
        const data =
          fn === 'reconcile_cards'
            ? { applied: true, syncedTo: args.p!.upTo, changed: 0 }
            : { updatedAt: '2026-11-06T12:00:00Z' };
        const builder = {
          setHeader(name: string, value: string) {
            if (name === 'x-card-sync') call.header = value;
            return builder;
          },
          then: (ok: (r: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok),
        };
        return builder;
      },
    };
    return { client: client as unknown as Parameters<typeof supabaseStudyRepository>[0], calls };
  }
  const ref = { noteGuid: 'a', ord: 0, deckId: L1 };

  it('each write says up to which change the page has the decks', async () => {
    const { client, calls } = fakeClient({ synced_to: 9, repair_from: null });
    const repo = supabaseStudyRepository(client);
    // Before reconciling, it says nothing (the database does not mark anything).
    await repo.suspend([ref], false);
    expect(await repo.cardsSyncedTo()).toBe(9);
    await repo.suspend([ref], false);
    await repo.reconcileCards({ since: 9, upTo: 14, changes: [] });
    await repo.bury([ref], new Date(NOW), false);
    expect(calls.map((c) => [c.fn, c.header])).toEqual([
      ['suspend_cards', null],
      ['suspend_cards', '9'],
      ['reconcile_cards', null],
      ['bury_cards', '14'],
    ]);
  });

  it('with rows to repair, the cursor is where the repair goes from', async () => {
    const { client } = fakeClient({ synced_to: 9, repair_from: 7 });
    expect(await supabaseStudyRepository(client).cardsSyncedTo()).toBe(7);
  });
});
