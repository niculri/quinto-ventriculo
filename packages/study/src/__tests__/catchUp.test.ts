// Tests the plan to catch up with overdue cards and the sentence that says it.
import { describe, expect, it } from 'vitest';
import { LARGE_BACKLOG, catchUpPlan, catchUpText } from '../catchUp';

describe('catching up', () => {
  it('a small backlog needs no plan', () => {
    expect(catchUpPlan(LARGE_BACKLOG - 1, null)).toBeNull();
    expect(catchUpPlan(LARGE_BACKLOG, null)).not.toBeNull();
  });

  it('as the example: 300 late, 60 a day, 5 days', () => {
    const plan = catchUpPlan(300, null)!;
    expect(plan).toEqual({ overdue: 300, perDay: 60, days: 5 });
    expect(catchUpText(plan)).toBe(
      'Llevas 300 atrasadas. Con ~60 al día, además de lo de hoy, te pones al día en 5 días.',
    );
  });

  it('a very large one takes more days, not more than 100 a day', () => {
    expect(catchUpPlan(1000, null)).toEqual({ overdue: 1000, perDay: 100, days: 10 });
  });

  it('the test comes first: over the days left', () => {
    expect(catchUpPlan(300, 2)).toEqual({ overdue: 300, perDay: 150, days: 2 });
    expect(catchUpText(catchUpPlan(100, 1)!)).toMatch(/en 1 día\.$/);
    expect(catchUpPlan(300, 0)).toBeNull();
  });

  it('the numbers always reach', () => {
    for (const overdue of [50, 51, 317, 999, 5000]) {
      const p = catchUpPlan(overdue, null)!;
      expect(p.perDay * p.days).toBeGreaterThanOrEqual(overdue);
    }
  });
});
