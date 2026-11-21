// The sessions the differential test runs: which data, which deck is studied and at what moment.
import { ASSESSMENT, BEFORE_ROLLOVER, COURSE, L1, L2, NOON, build } from './fixtures';
import type { Scenario } from './fixtures';

export const SCENARIOS: Scenario[] = [
  {
    name: 'advanced mode, the whole course',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: true, start: NOON }, COURSE),
  },
  {
    name: 'simple mode, the whole course',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: false, start: NOON, seed: 11 }, COURSE),
  },
  {
    name: 'advanced mode, one unit with a subdeck, no learn-ahead',
    rootId: L1,
    start: NOON,
    data: () => build({ full: true, start: NOON, seed: 5, learnAheadMinutes: 0 }, L1),
  },
  {
    name: 'ten minutes before the day turns over, with the day’s answers',
    rootId: COURSE,
    start: BEFORE_ROLLOVER,
    data: () => build({ full: true, start: BEFORE_ROLLOVER, withAnswers: true, seed: 3 }, COURSE),
  },
  {
    name: 'simple mode before the rollover, with the day’s answers',
    rootId: ASSESSMENT,
    start: BEFORE_ROLLOVER,
    data: () =>
      build({ full: false, start: BEFORE_ROLLOVER, withAnswers: true, seed: 21 }, ASSESSMENT),
  },
  {
    name: 'few cards, so the queue empties and fills again',
    rootId: L2,
    start: NOON,
    data: () => build({ full: true, start: NOON, seed: 9, notesPerDeck: 2 }, L2),
  },
  {
    name: 'advanced mode, reviews one failure from being leeches (suspended in the strict unit)',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: true, start: NOON, seed: 17, leechy: true }, COURSE),
  },
  {
    name: 'simple mode, reviews one failure from being leeches',
    rootId: COURSE,
    start: NOON,
    data: () => build({ full: false, start: NOON, seed: 19, leechy: true }, COURSE),
  },
  {
    name: 'simple mode, a test date a week away',
    rootId: ASSESSMENT,
    start: NOON,
    data: () =>
      build(
        { full: false, start: NOON, seed: 23, exam: { date: '2026-11-25', finalDays: 3 } },
        ASSESSMENT,
      ),
  },
  {
    name: 'advanced mode, a test date three days away, ten minutes before the day turns over',
    rootId: COURSE,
    start: BEFORE_ROLLOVER,
    data: () =>
      build(
        {
          full: true,
          start: BEFORE_ROLLOVER,
          withAnswers: true,
          seed: 29,
          exam: { date: '2026-11-22', finalDays: 1 },
        },
        COURSE,
      ),
  },
  {
    name: 'simple mode, the final review starting when the day turns over',
    rootId: ASSESSMENT,
    start: BEFORE_ROLLOVER,
    data: () =>
      build(
        {
          full: false,
          start: BEFORE_ROLLOVER,
          withAnswers: true,
          seed: 31,
          exam: { date: '2026-11-20', finalDays: 1 },
        },
        ASSESSMENT,
      ),
  },
];
