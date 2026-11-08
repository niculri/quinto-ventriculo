/**
 * The study queue against real Anki 25.9 (scripts/anki_queue.py): a deck with two subdecks and its three
 * presets, cards in every state, what was studied today, and a whole study session. At every card, the whole
 * queue (in order) and the counts must be Anki's; after every answer, the card must be Anki's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StudyQueue, answerCard, configFromAnki } from '../src';
import type { CardRecord, QueueCard, Rating, SchedTiming } from '../src';
import { fromAnki, queueCard } from './anki-cards';
import type { AnkiCard } from './anki-cards';

interface Scenario {
  name: string;
  timing: SchedTiming;
  decks: { key: string; id: number; name: string; config: Record<string, unknown> }[];
  studied: Record<string, [number, number]>;
  cards: AnkiCard[];
  steps: {
    counts: [number, number, number];
    order: [number, number][];
    card: number;
    rating: Rating;
    timing: SchedTiming;
    answeredAt: number;
    after: AnkiCard;
  }[];
}

const trace = JSON.parse(
  readFileSync(join(import.meta.dirname, 'golden', 'queue.json'), 'utf8'),
) as { testMode: boolean; scenarios: Scenario[] };

describe('the queue against Anki', () => {
  it('the trace is without fuzz', () => expect(trace.testMode).toBe(true));

  for (const sc of trace.scenarios) {
    it(sc.name, () => {
      const decks = sc.decks.map((d) => ({
        id: String(d.id),
        name: d.name,
        config: configFromAnki(d.config),
      }));
      const configOf = new Map(decks.map((d) => [d.id, d.config]));
      const byId = new Map(sc.cards.map((c) => [c.id, c]));
      const records = new Map<number, CardRecord>(sc.cards.map((c) => [c.id, fromAnki(c)]));
      const cards: QueueCard[] = sc.cards.map(queueCard);
      const studiedToday = new Map(
        sc.decks.map((d) => {
          const [newCount, reviewCount] = sc.studied[d.key] ?? [0, 0];
          return [String(d.id), { newCount, reviewCount }];
        }),
      );
      const queue = StudyQueue.build({
        rootDeckId: String(sc.decks[0]!.id),
        decks,
        cards,
        studiedToday,
        timing: sc.timing,
      });
      const name = (id: number) => `${byId.get(id)!.guid}/${byId.get(id)!.ord}`;

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
        expect(Math.abs(result.card.due - expected.due), `${where}: due`).toBeLessThanOrEqual(1);
        // From here on, the card as Anki left it (a second of difference in a learning step's time
        // could change the order of two cards due at the same moment).
        records.set(step.card, expected);
        queue.answered(key, expected, timing);
      });
      expect(queue.next(), `${sc.name}: finished`).toBeNull();
    });
  }
});
