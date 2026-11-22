// An in-memory repository that writes down each call and keeps the marks of concurrency (`strict`: it refuses an
// answer that names another mark than the card's, as the database does). Each write changes them, an undo puts them back.
import type { CardRef, ReviewInput, StoredCard, UndoResult } from '@qv/schema/user';
import { cardKey } from '../../scheduler';
import { CardChangedError } from './referenceSave';
import type { SessionRepository } from './referenceSave';

export interface Call {
  name: string;
  args: unknown;
}

interface Written {
  action: UndoResult['action'];
  card: CardRef | null;
  marks: Map<string, string | null>;
}

/** Fails the calls whose index (0, 1, 2…) it names, with the error it gives. */
export type Failures = ReadonlyMap<number, () => Error>;

export class FakeRepository implements SessionRepository {
  readonly calls: Call[] = [];
  private readonly marks = new Map<string, string>();
  private readonly cardOf = new Map<string, CardRef>();
  private readonly last = new Map<string, { lastReview: string | null; reps: number }>();
  private readonly written: Written[] = [];
  private version = 0;

  constructor(
    rows: readonly StoredCard[],
    private readonly failures: Failures = new Map(),
    private readonly strict = false,
  ) {
    for (const r of rows) {
      this.marks.set(cardKey(r), r.updatedAt);
      this.cardOf.set(cardKey(r), r);
    }
  }

  private call(name: string, args: unknown) {
    const index = this.calls.length;
    this.calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    const fail = this.failures.get(index);
    if (fail) throw fail();
  }

  private touch(cards: readonly CardRef[], action: Written['action']) {
    const marks = new Map<string, string | null>();
    for (const c of cards) {
      marks.set(cardKey(c), this.marks.get(cardKey(c)) ?? null);
      this.marks.set(cardKey(c), `v${++this.version}`);
      this.cardOf.set(cardKey(c), c);
    }
    this.written.push({ action, card: cards[0] ?? null, marks });
  }

  recordReview(input: ReviewInput) {
    try {
      this.call('recordReview', input);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new CardChangedError());
    }
    if (this.strict && input.expectedUpdatedAt !== (this.marks.get(cardKey(input.card)) ?? null)) {
      return Promise.reject(new CardChangedError());
    }
    this.touch([input.card, ...input.bury], 'answer');
    this.last.set(cardKey(input.card), {
      lastReview: input.state.lastReview,
      reps: input.state.reps,
    });
    return Promise.resolve({ updatedAt: this.marks.get(cardKey(input.card))! });
  }

  bury(cards: CardRef[], until: Date, note: boolean) {
    return this.write('bury', { cards, until, note }, cards, note ? 'bury_note' : 'bury_card');
  }

  suspend(cards: CardRef[], note: boolean) {
    return this.write('suspend', { cards, note }, cards, note ? 'suspend_note' : 'suspend_card');
  }

  setFlag(card: CardRef, flag: number) {
    return this.write('setFlag', { card, flag }, [card], 'flag');
  }

  private write(name: string, args: unknown, cards: CardRef[], action: Written['action']) {
    try {
      this.call(name, args);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new CardChangedError());
    }
    this.touch(cards, action);
    return Promise.resolve();
  }

  undo(): Promise<UndoResult | null> {
    try {
      this.call('undo', null);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new CardChangedError());
    }
    const item = this.written.pop();
    if (!item) return Promise.resolve(null);
    for (const [k, mark] of item.marks) {
      if (mark === null) this.marks.delete(k);
      else this.marks.set(k, mark);
    }
    const card = item.card ?? { noteGuid: '', ord: -1, deckId: '' };
    return Promise.resolve({ ...card, action: item.action, rating: null });
  }

  cards(deckIds: string[]): Promise<StoredCard[]> {
    try {
      this.call('cards', deckIds);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new CardChangedError());
    }
    const rows: StoredCard[] = [];
    for (const [k, mark] of this.marks) {
      const card = this.cardOf.get(k)!;
      if (!deckIds.includes(card.deckId)) continue;
      const last = this.last.get(k);
      rows.push({
        ...card,
        phase: 'review',
        interday: true,
        remainingSteps: 0,
        due: null,
        interval: 0,
        stability: null,
        difficulty: null,
        reps: last?.reps ?? 0,
        lapses: 0,
        lastReview: last?.lastReview ?? null,
        flag: 0,
        suspended: false,
        buriedUntil: null,
        leech: false,
        updatedAt: mark,
      });
    }
    return Promise.resolve(rows);
  }
}
