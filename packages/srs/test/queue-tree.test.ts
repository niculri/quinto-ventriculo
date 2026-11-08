/**
 * The queue of a deep deck tree against real Anki 25.9 (scripts/anki_tree.py), as the published decks are:
 * root → semester → course → assessment → week → deck → «Extras», with the parents on «Default». The counts
 * of every deck of Anki's deck list, and whole sessions studied from the assessment and from the root: at
 * every card, the whole queue (in order) and the counts must be Anki's. queue-tree-names.json (--names) does
 * the same with the deck names that a plain string order gets wrong.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StudyQueue, answerCard, configFromAnki, countStudiedToday, sortDecksByName } from '../src';
import type { CardRecord, QueueCard, Rating, SchedTiming } from '../src';
import { fromAnki, queueCard } from './anki-cards';
import type { AnkiCard } from './anki-cards';

interface Scenario {
  name: string;
  root: string;
  timing: SchedTiming;
  decks: { key: string; id: number; name: string; config: Record<string, unknown> }[];
  /** Anki's deck list, flat. */
  deckOrder?: string[];
  studied: Record<string, [number, number]>;
  cards: AnkiCard[];
  counts: Record<string, [number, number, number]>;
  steps: {
    counts: [number, number, number];
    order: [number, number][];
    card: number;
    rating: Rating;
    timing: SchedTiming;
    answeredAt: number;
    after: AnkiCard;
  }[];
  endCounts: Record<string, [number, number, number]>;
  endCards: AnkiCard[];
  endTiming: SchedTiming;
}

const golden = (file: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'golden', file), 'utf8')) as {
    testMode: boolean;
    scenarios: Scenario[];
  };
const trace = golden('queue-tree.json');
const names = golden('queue-tree-names.json');

describe('a deck tree against Anki: from the assessment and from the root', () => {
  it('the traces are without fuzz', () => {
    expect(trace.testMode).toBe(true);
    expect(names.testMode).toBe(true);
  });

  for (const sc of [...trace.scenarios, ...names.scenarios]) {
    const decks = sc.decks.map((d) => ({
      id: String(d.id),
      name: d.name,
      config: configFromAnki(d.config),
    }));
    const keyOf = new Map(sc.decks.map((d) => [String(d.id), d.key]));
    /** Anki keeps a counter per deck: what was studied in it and (when answering) in every deck below it. */
    const studiedAt = (answers: { deckId: string; queue: CardRecord['queue'] }[]) => {
      const counted = countStudiedToday(answers, decks);
      return new Map(
        decks.map((d) => {
          const [newCount, reviewCount] = sc.studied[keyOf.get(d.id)!] ?? [0, 0];
          const c = counted.get(d.id);
          return [
            d.id,
            {
              newCount: newCount + (c?.newCount ?? 0),
              reviewCount: reviewCount + (c?.reviewCount ?? 0),
            },
          ];
        }),
      );
    };
    const build = (
      rootDeckId: string,
      cards: QueueCard[],
      timing: SchedTiming,
      answers: { deckId: string; queue: CardRecord['queue'] }[] = [],
      deckList = false,
    ) =>
      StudyQueue.build({
        rootDeckId,
        decks,
        cards,
        studiedToday: studiedAt(answers),
        timing,
        deckList,
      });

    if (sc.deckOrder) {
      it(`${sc.name}: the order of the decks`, () => {
        const order = sortDecksByName([...decks].reverse()).map((d) => d.name);
        expect(order).toEqual(sc.deckOrder);
      });
    }

    it(`${sc.name}: the counts of every deck of the deck list`, () => {
      const cards = sc.cards.map(queueCard);
      for (const d of decks) {
        const c = build(d.id, cards, sc.timing, [], true).counts();
        expect([c.new, c.learning, c.review], `${d.name}`).toEqual(sc.counts[d.id]);
      }
    });

    it(`${sc.name}: the session`, () => {
      const configOf = new Map(decks.map((d) => [d.id, d.config]));
      const byId = new Map(sc.cards.map((c) => [c.id, c]));
      const records = new Map<number, CardRecord>(sc.cards.map((c) => [c.id, fromAnki(c)]));
      const queue = build(sc.root, sc.cards.map(queueCard), sc.timing);
      const name = (id: number) => `${byId.get(id)!.guid}/${byId.get(id)!.ord}`;
      expect(sc.steps.length).toBeGreaterThan(5);

      sc.steps.forEach((step, n) => {
        const where = `${sc.name}, card ${n + 1}`;
        expect(
          queue.entries().map((e) => `${e.noteGuid}/${e.ord}`),
          `${where}: the queue`,
        ).toEqual(step.order.map(([id]) => name(id)));
        const c = queue.counts();
        expect([c.new, c.learning, c.review], `${where}: counts`).toEqual(step.counts);

        const anki = byId.get(step.card)!;
        const key = { noteGuid: anki.guid, ord: anki.ord };
        const timing = { ...step.timing, now: step.answeredAt };
        const result = answerCard(
          key,
          records.get(step.card)!,
          step.rating,
          configOf.get(String(anki.deck))!,
          timing,
          { fuzz: false },
        );
        const expected = fromAnki(step.after);
        expect({ ...result.card, due: 0, stability: 0, difficulty: 0 }, where).toEqual({
          ...expected,
          due: 0,
          stability: 0,
          difficulty: 0,
        });
        records.set(step.card, expected);
        queue.answered(key, expected, timing);
      });
      expect(queue.next(), `${sc.name}: finished`).toBeNull();
    });

    it(`${sc.name}: the deck list at the end, with what was studied counted in every deck`, () => {
      const answers = sc.steps.map((step) => ({
        deckId: String(step.after.deck),
        queue: fromAnki(sc.cards.find((c) => c.id === step.card)!).queue,
      }));
      // Each answer with the card as it was when answered (a card can be answered several times).
      const seen = new Map<number, AnkiCard>(sc.cards.map((c) => [c.id, c]));
      sc.steps.forEach((step, i) => {
        answers[i]!.queue = fromAnki(seen.get(step.card)!).queue;
        seen.set(step.card, step.after);
      });
      const cards = sc.endCards.map(queueCard);
      for (const d of decks) {
        const c = build(d.id, cards, sc.endTiming, answers, true).counts();
        expect([c.new, c.learning, c.review], `${d.name}`).toEqual(sc.endCounts[d.id]);
      }
    });
  }
});
