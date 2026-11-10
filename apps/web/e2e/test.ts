import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** The site's day starts at 4:00 (the default «Next day starts at»), in the browser's time zone. */
const DAY_STARTS_AT = 4;

/**
 * Midday of the site's today, in the browser's time zone (this process shares it). A learning step of 10 minutes
 * answered at 3:55 is due on the next day, so the buttons and the counts changed when the CI ran just before 4:00
 * (step 1.9). From midday no test reaches the next day; the date is still the real one, so the dates the tests
 * compute here (e2e/exam.spec.ts) are the page's.
 */
function middayOfToday(): Date {
  const d = new Date(Date.now() - DAY_STARTS_AT * 3_600_000);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Every spec imports `test` from here, not from @playwright/test: every page of the test starts at midday and its
 * time goes on as usual (timers too), whatever the hour the suite runs at.
 */
export const test = base.extend({
  context: async ({ context }, run) => {
    await context.clock.install({ time: middayOfToday() });
    await run(context);
  },
});
