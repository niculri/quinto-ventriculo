// SPDX-License-Identifier: AGPL-3.0-or-later
/** Time per answered card on a synthetic deck: `npx tsx packages/srs/scripts/bench-queue.ts [cards] [answers]`.
 * Each round is a `next` and an `answered` (every fifth «Again»), on the `StudyQueue` object and on the pure functions. */
import {
  StudyQueue,
  answeredIn,
  answerCard,
  buildQueue,
  defaultConfig,
  newCard,
  nextOf,
} from '../src';
import type { QueueCard, QueueDeck, SchedTiming } from '../src';

const cardCount = Number(process.argv[2] ?? 5000);
const answerCount = Number(process.argv[3] ?? 2000);
const timing: SchedTiming = {
  now: 1_800_000_000,
  today: 20_000,
  nextDayAt: 1_800_000_000 + 30_000,
};
const config = { ...defaultConfig(), newPerDay: 99_999, reviewsPerDay: 99_999 };
const deck: QueueDeck = { id: '1', name: 'Deck', config };
const cards: QueueCard[] = Array.from({ length: cardCount }, (_, i) => ({
  noteGuid: `n${Math.floor(i / 2)}`,
  ord: i % 2,
  deckId: '1',
  index: i,
  record: null,
  hidden: false,
}));

const input = { rootDeckId: '1', decks: [deck], cards, studiedToday: new Map(), timing };
const build = () => StudyQueue.build(input);

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
const report = (label: string, samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(
    `${label}: mean ${(mean * 1000).toFixed(1)} µs, p99 ${(percentile(sorted, 0.99) * 1000).toFixed(1)} µs`,
  );
};

const runPure = () => {
  let queue = buildQueue(input);
  const nextTimes: number[] = [];
  const answerTimes: number[] = [];
  let now = timing.now;
  for (let i = 0; i < answerCount; i++) {
    const t0 = performance.now();
    const entry = nextOf(queue);
    const t1 = performance.now();
    if (!entry) break;
    now += 5;
    const t = { ...timing, now };
    const result = answerCard(entry, newCard(0), i % 5 === 0 ? 1 : 3, config, t, { fuzz: false });
    const t2 = performance.now();
    queue = answeredIn(queue, entry, result.card, t).queue;
    const t3 = performance.now();
    nextTimes.push(t1 - t0);
    answerTimes.push(t3 - t2);
  }
  return { nextTimes, answerTimes };
};

const run = () => {
  const queue = build();
  const nextTimes: number[] = [];
  const answerTimes: number[] = [];
  let now = timing.now;
  for (let i = 0; i < answerCount; i++) {
    const t0 = performance.now();
    const entry = queue.next();
    const t1 = performance.now();
    if (!entry) break;
    now += 5;
    const t = { ...timing, now };
    const result = answerCard(entry, newCard(0), i % 5 === 0 ? 1 : 3, config, t, { fuzz: false });
    const t2 = performance.now();
    queue.answered(entry, result.card, t);
    const t3 = performance.now();
    nextTimes.push(t1 - t0);
    answerTimes.push(t3 - t2);
  }
  return { nextTimes, answerTimes };
};

run(); // warm up
runPure();
const buildStart = performance.now();
build();
console.log(`build (${cardCount} cards): ${(performance.now() - buildStart).toFixed(1)} ms`);
for (const [label, runner] of [
  ['object', run],
  ['pure', runPure],
] as const) {
  const rounds = [runner(), runner(), runner()];
  report(
    `${label} next`,
    rounds.flatMap((r) => r.nextTimes),
  );
  report(
    `${label} answered`,
    rounds.flatMap((r) => r.answerTimes),
  );
}
