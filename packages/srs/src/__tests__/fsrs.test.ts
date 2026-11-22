// The FSRS parameters a preset may carry, the retrievability curve and the guards around the memory state.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETERS,
  allowShortTerm,
  fillParameters,
  fsrsNextStates,
  retrievability,
} from '../fsrs';

const seventeen = Array.from({ length: 17 }, (_, i) => i + 1);

describe('fillParameters', () => {
  it('uses the FSRS-6 defaults when the preset has none', () => {
    expect(fillParameters([])).toEqual([...DEFAULT_PARAMETERS]);
    expect(fillParameters([])).toHaveLength(21);
  });

  it('keeps the 21 parameters of FSRS-6 and copies them', () => {
    const own = [...DEFAULT_PARAMETERS];
    const filled = fillParameters(own);
    expect(filled).toEqual(own);
    expect(filled).not.toBe(own);
  });

  it('completes the 19 of FSRS-5 with a zero and the 0.5 decay', () => {
    const nineteen = seventeen.concat([18, 19]);
    expect(fillParameters(nineteen)).toEqual([...nineteen, 0, 0.5]);
  });

  it('converts the 17 of FSRS-4.5: w4 and w5 are rebuilt, w6 moves half a point and the tail is zeros plus the decay', () => {
    const filled = fillParameters(seventeen);
    expect(filled).toHaveLength(21);
    expect(filled[4]).toBe(6 * 2 + 5);
    expect(filled[5]).toBeCloseTo(Math.log(6 * 3 + 1) / 3, 12);
    expect(filled[6]).toBe(7.5);
    expect(filled.slice(17)).toEqual([0, 0, 0, 0.5]);
    expect(filled.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(filled.slice(7, 17)).toEqual(seventeen.slice(7));
  });

  it('does not change the preset’s own array when it converts the 17', () => {
    const own = [...seventeen];
    fillParameters(own);
    expect(own).toEqual(seventeen);
  });

  it.each([1, 16, 18, 20, 22])('refuses a list of %i parameters', (length) => {
    expect(() => fillParameters(new Array<number>(length).fill(1))).toThrow(/Parámetros FSRS/);
  });
});

describe('retrievability', () => {
  const memory = { stability: 12, difficulty: 5 };

  it('is 1 right after the review', () => {
    expect(retrievability([], memory, 0)).toBe(1);
  });

  it('is 90 % after as many days as the stability, with whatever decay the parameters carry', () => {
    for (const params of [[], seventeen, seventeen.concat([18, 19])]) {
      expect(retrievability(params, memory, 12)).toBeCloseTo(0.9, 10);
    }
  });

  it('falls as days go by and falls slower for a more stable memory', () => {
    const early = retrievability([], memory, 3);
    const late = retrievability([], memory, 30);
    expect(late).toBeLessThan(early);
    expect(retrievability([], { stability: 120, difficulty: 5 }, 30)).toBeGreaterThan(late);
  });
});

describe('allowShortTerm', () => {
  const withW17W18 = (w17: number, w18: number) => {
    const p = [...DEFAULT_PARAMETERS];
    p[17] = w17;
    p[18] = w18;
    return p;
  };

  it('needs w17 and w18, so only presets of 19 parameters or more', () => {
    expect(allowShortTerm([])).toBe(false);
    expect(allowShortTerm(seventeen)).toBe(false);
    expect(allowShortTerm(seventeen.concat([1, 1]))).toBe(true);
  });

  it('needs both above zero, each on its own', () => {
    expect(allowShortTerm(withW17W18(0.5, 0.5))).toBe(true);
    expect(allowShortTerm(withW17W18(0, 0.5))).toBe(false);
    expect(allowShortTerm(withW17W18(0.5, 0))).toBe(false);
  });
});

describe('fsrsNextStates', () => {
  it('gives a longer interval to each better answer for a card with a memory', () => {
    const states = fsrsNextStates([], { stability: 10, difficulty: 5 }, 0.9, 10);
    const { again, hard, good, easy } = states;
    expect(again.interval).toBeLessThan(hard.interval);
    expect(hard.interval).toBeLessThan(good.interval);
    expect(good.interval).toBeLessThan(easy.interval);
  });

  it('asks for the interval that leaves the desired retention: a stricter retention schedules sooner', () => {
    const memory = { stability: 10, difficulty: 5 };
    const lax = fsrsNextStates([], memory, 0.8, 10).good.interval;
    const strict = fsrsNextStates([], memory, 0.95, 10).good.interval;
    expect(strict).toBeLessThan(lax);
  });

  it('at 90 % retention, a memory’s interval equals its stability', () => {
    const next = fsrsNextStates([], null, 0.9, 0).good;
    expect(next.interval).toBeCloseTo(next.memory.stability, 6);
  });

  it('refuses parameters that give a memory without a number', () => {
    const broken = [...DEFAULT_PARAMETERS];
    broken[0] = Number.NaN;
    expect(() => fsrsNextStates(broken, null, 0.9, 0)).toThrow('Estado de memoria inválido');
  });

  it('keeps short-term stability from shrinking after Good or Easy, as fsrs-rs does, but not after Hard', () => {
    const params = [...DEFAULT_PARAMETERS];
    params[17] = 0.1;
    params[18] = -3;
    const memory = { stability: 5, difficulty: 5 };
    const next = fsrsNextStates(params, memory, 0.9, 0);
    expect(next.good.memory.stability).toBeGreaterThanOrEqual(5);
    expect(next.easy.memory.stability).toBeGreaterThanOrEqual(5);
    expect(next.hard.memory.stability).toBeLessThan(5);
  });
});
