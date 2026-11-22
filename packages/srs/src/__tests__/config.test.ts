// Presets: what one saved with «Retención histórica» or its own FSRS parameters still does, what an Anki export and a
// stored preset make of odd values, and how the steps are written and read.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETERS,
  configFromAnki,
  defaultConfig,
  newCard,
  parseConfig,
  schedTiming,
  schedulingStates,
  stepsToString,
  stringToSteps,
} from '..';

describe('a preset saved with what «Opciones» no longer shows', () => {
  const custom = Array.from({ length: 21 }, (_, i) =>
    Number((DEFAULT_PARAMETERS[i]! * 1.3).toFixed(4)),
  );
  const stored = { ...defaultConfig(), historicalRetention: 0.8, fsrsParams: custom };

  it('reads its «Retención histórica» and its parameters', () => {
    const config = parseConfig(JSON.parse(JSON.stringify(stored)));
    expect(config.historicalRetention).toBe(0.8);
    expect(config.fsrsParams).toEqual(custom);
  });

  it('schedules with its own parameters, not with the defaults', () => {
    const timing = schedTiming(Date.UTC(2026, 10, 12, 15) / 1000, 'America/Santiago', 4);
    const key = { noteGuid: 'guid-inventado', ord: 0 };
    const states = (config: ReturnType<typeof parseConfig>) =>
      schedulingStates(key, newCard(0), config, timing, { fuzz: false });
    const own = states(parseConfig(stored));
    const defaults = states(parseConfig({ ...stored, fsrsParams: [] }));
    expect(own).toEqual(states({ ...defaultConfig(), fsrsParams: custom }));
    expect(own.easy).not.toEqual(defaults.easy);
  });
});

describe('steps as «Opciones» writes and reads them', () => {
  it('writes each step in the largest unit that holds it whole', () => {
    expect(stepsToString([0.5, 1.5, 90, 1500, 1440, 60, 1])).toBe('30s 90s 90m 25h 1d 1h 1m');
  });

  it('reads a bare number as minutes, and an unknown unit too', () => {
    expect(stringToSteps('5 7x')).toEqual([5, 7]);
  });

  it('caps a step at 2^31 seconds, so absurd durations do not overflow', () => {
    expect(stringToSteps('999999999d')).toEqual([2 ** 31 / 60]);
  });

  it('writes then reads what it wrote', () => {
    const steps = [0.5, 1, 10, 90, 1500, 1440, 4320];
    expect(stringToSteps(stepsToString(steps))).toEqual(steps);
  });
});

describe('a preset exported by Anki', () => {
  it('uses the first set of FSRS parameters it has, newest generation first', () => {
    const v6 = Array.from({ length: 21 }, () => 1);
    const v5 = Array.from({ length: 19 }, () => 2);
    const old = Array.from({ length: 17 }, () => 3);
    expect(
      configFromAnki({ fsrsParams6: v6, fsrsParams5: v5, fsrsWeights: old }).fsrsParams,
    ).toEqual(v6);
    expect(
      configFromAnki({ fsrsParams6: [], fsrsParams5: v5, fsrsWeights: old }).fsrsParams,
    ).toEqual(v5);
    expect(configFromAnki({ fsrsWeights: old }).fsrsParams).toEqual(old);
    expect(configFromAnki({ fsrsParams5: [1, 2, 3] }).fsrsParams).toEqual([]);
  });

  it('reads the graduating intervals, and falls back to 1 and 4 days when the list is empty', () => {
    expect(configFromAnki({ new: { ints: [2, 6] } })).toMatchObject({
      graduatingIntervalGood: 2,
      graduatingIntervalEasy: 6,
    });
    expect(configFromAnki({ new: { ints: [3] } })).toMatchObject({
      graduatingIntervalGood: 3,
      graduatingIntervalEasy: 4,
    });
    expect(configFromAnki({ new: { ints: [] } })).toMatchObject({
      graduatingIntervalGood: 1,
      graduatingIntervalEasy: 4,
    });
  });

  it('turns the options’ numbers into names, and an unknown number into the default', () => {
    expect(
      configFromAnki({
        newGatherPriority: 3,
        newSortOrder: 3,
        reviewOrder: 11,
        newMix: 1,
        interdayLearningMix: 2,
      }),
    ).toMatchObject({
      newCardGatherPriority: 'randomNotes',
      newCardSortOrder: 'randomNoteThenTemplate',
      reviewOrder: 'retrievabilityDescending',
      newMix: 'afterReviews',
      interdayLearningMix: 'beforeReviews',
    });
    expect(configFromAnki({ newGatherPriority: 5 }).newCardGatherPriority).toBe(
      'deckThenRandomNotes',
    );
    expect(configFromAnki({ newGatherPriority: 4 }).newCardGatherPriority).toBe('randomCards');
    expect(
      configFromAnki({
        newGatherPriority: 99,
        newSortOrder: 99,
        reviewOrder: 99,
        newMix: 99,
        interdayLearningMix: 99,
      }),
    ).toMatchObject({
      newCardGatherPriority: 'deck',
      newCardSortOrder: 'template',
      reviewOrder: 'day',
      newMix: 'mixWithReviews',
      interdayLearningMix: 'mixWithReviews',
    });
  });

  it('suspends leeches only with action 0, and takes the default for an answer-time cap out of range', () => {
    expect(configFromAnki({ lapse: { leechAction: 0 } }).leechAction).toBe('suspend');
    expect(configFromAnki({ lapse: { leechAction: 1 } }).leechAction).toBe('tagOnly');
    expect(configFromAnki({}).leechAction).toBe('tagOnly');
    expect(configFromAnki({ maxTaken: -5 }).capAnswerTimeToSecs).toBe(60);
    expect(configFromAnki({ maxTaken: 7201 }).capAnswerTimeToSecs).toBe(60);
    expect(configFromAnki({ maxTaken: 7200 }).capAnswerTimeToSecs).toBe(7200);
  });

  it('turns the ease factor from permille to a multiplier and drops steps that are zero, negative or not numbers', () => {
    const c = configFromAnki({ new: { initialFactor: 2300, delays: [1, 0, -2, 10] } });
    expect(c.initialEase).toBe(2.3);
    expect(c.learnSteps).toEqual([1, 10]);
  });

  it('never trusts a field of the wrong type', () => {
    const c = configFromAnki({ new: 'x', rev: [], lapse: null, maxTaken: 'a' });
    expect(c).toEqual({ ...defaultConfig(), desiredRetention: c.desiredRetention });
  });
});

describe('a stored preset', () => {
  it('takes the default for a missing or mistyped key, so older presets keep working', () => {
    const c = parseConfig({
      newPerDay: 'many',
      buryNew: 'yes',
      learnSteps: [1, 'x'],
      reviewOrder: 'sideways',
    });
    expect(c).toEqual(defaultConfig());
  });

  it('truncates the whole-number options and drops the steps that cannot be waited', () => {
    const c = parseConfig({ newPerDay: 12.9, leechThreshold: 8.5, learnSteps: [1, 0, -3, 10] });
    expect(c.newPerDay).toBe(12);
    expect(c.leechThreshold).toBe(8);
    expect(c.learnSteps).toEqual([1, 10]);
  });

  it('keeps FSRS parameters only in the lengths FSRS knows', () => {
    for (const length of [17, 19, 21]) {
      const params = new Array<number>(length).fill(1);
      expect(parseConfig({ fsrsParams: params }).fsrsParams).toEqual(params);
    }
    expect(parseConfig({ fsrsParams: new Array<number>(20).fill(1) }).fsrsParams).toEqual([]);
  });
});
