/**
 * The study queue against a whole study session in real Anki 25.9 (scripts/anki_queue.py): at every card, the queue
 * in order and the counts are Anki's, and after every answer the card is Anki's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answerCard,
  answeredIn,
  buildQueue,
  configFromAnki,
  countsOf,
  entriesOf,
  nextOf,
} from '../..';
import type { CardRecord, QueueCard, Rating, SchedTiming } from '../..';
import { fromAnki, queueCard } from './ankiCards';
import type { AnkiCard } from './ankiCards';

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
  readFileSync(join(import.meta.dirname, '../../../test/golden', 'queue.json'), 'utf8'),
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
      let queue = buildQueue({
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
          entriesOf(queue).map((e) => `${e.noteGuid}/${e.ord}`),
          `${where}: the queue`,
        ).toEqual(step.order.map(([id]) => name(id)));
        const c = countsOf(queue);
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
        queue = answeredIn(queue, key, expected, timing).queue;
      });
      expect(nextOf(queue), `${sc.name}: finished`).toBeNull();
    });
  }
});
