/**
 * The queue built anew before every card, against real Anki 25.9 (scripts/anki_rebuild.py): as the web builds
 * it when the study page opens, after burying or suspending and after an undo. The counters of what was
 * studied today come from the answers so far, added up in each deck and the decks above it, as Anki does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StudyQueue, configFromAnki, countStudiedToday } from '../src';
import type { Queue, SchedTiming, StudiedToday } from '../src';
import { QUEUES, queueCard } from './anki-cards';
import type { AnkiCard } from './anki-cards';

interface Scenario {
  name: string;
  decks: { key: string; id: number; name: string; config: Record<string, unknown> }[];
  /** Anki's counters as the scenario set them before studying (each deck on its own). */
  studied: Record<string, [number, number]>;
  cards: AnkiCard[];
  steps: {
    timing: SchedTiming;
    changed: AnkiCard[];
    counts: [number, number, number];
    order: number[];
    card?: number;
    queueBefore?: number;
  }[];
}

const trace = JSON.parse(
  readFileSync(join(import.meta.dirname, 'golden', 'queue-rebuild.json'), 'utf8'),
) as { testMode: boolean; scenarios: Scenario[] };

describe('the queue built anew at every card, against Anki', () => {
  it('the trace is without fuzz', () => expect(trace.testMode).toBe(true));

  for (const sc of trace.scenarios) {
    it(sc.name, () => {
      const decks = sc.decks.map((d) => ({
        id: String(d.id),
        name: d.name,
        config: configFromAnki(d.config),
      }));
      const cards = new Map(sc.cards.map((c) => [c.id, c]));
      const answers: { deckId: string; queue: Queue }[] = [];
      const name = (id: number) => `${cards.get(id)!.guid}/${cards.get(id)!.ord}`;

      sc.steps.forEach((step, n) => {
        const where = `${sc.name}, card ${n + 1}`;
        for (const c of step.changed) cards.set(c.id, c);
        const counted = countStudiedToday(answers, decks);
        const studiedToday = new Map<string, StudiedToday>(
          sc.decks.map((d) => {
            const [newCount, reviewCount] = sc.studied[d.key] ?? [0, 0];
            const today = counted.get(String(d.id));
            return [
              String(d.id),
              {
                newCount: newCount + (today?.newCount ?? 0),
                reviewCount: reviewCount + (today?.reviewCount ?? 0),
              },
            ];
          }),
        );
        const queue = StudyQueue.build({
          rootDeckId: String(sc.decks[0]!.id),
          decks,
          cards: [...cards.values()].sort((a, b) => a.id - b.id).map(queueCard),
          studiedToday,
          timing: step.timing,
        });
        expect(
          queue.entries().map((e) => `${e.noteGuid}/${e.ord}`),
          `${where}: the queue`,
        ).toEqual(step.order.map(name));
        const c = queue.counts();
        expect([c.new, c.learning, c.review], `${where}: counts`).toEqual(step.counts);
        if (step.card !== undefined) {
          answers.push({
            deckId: String(cards.get(step.card)!.deck),
            queue: QUEUES[step.queueBefore!]!,
          });
        }
      });
    });
  }

  it('without adding up through the tree, a parent would let more cards through', () => {
    const decks = [
      { id: '1', name: 'Mazo' },
      { id: '2', name: 'Mazo::Sub' },
      { id: '3', name: 'Mazo::Sub::Más' },
      { id: '4', name: 'Otro' },
    ];
    expect(
      countStudiedToday(
        [
          { deckId: '3', queue: 'new' },
          { deckId: '2', queue: 'review' },
          { deckId: '2', queue: 'dayLearn' },
          { deckId: '1', queue: 'learn' },
          { deckId: '9', queue: 'new' },
        ],
        decks,
      ),
    ).toEqual(
      new Map([
        ['1', { newCount: 1, reviewCount: 2 }],
        ['2', { newCount: 1, reviewCount: 2 }],
        ['3', { newCount: 1, reviewCount: 0 }],
        ['9', { newCount: 1, reviewCount: 0 }],
      ]),
    );
  });
});
