// The `test` every spec imports instead of Playwright's: each page starts at midday of the site's day, whatever the
// hour the suite runs at, and its time goes on as usual.
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** The site's day starts at 4:00 (the default «Next day starts at»), in the browser's time zone. */
const DAY_STARTS_AT = 4;

/**
 * Midday of the site's today, in the browser's time zone (this process shares it). A learning step of 10 minutes
 * answered at 3:55 is due on the next day, so near 4:00 the buttons and the counts would change; from midday no test
 * reaches the next day. The date is still the real one, so the dates the tests compute here are the page's.
 */
function middayOfToday(): Date {
  const d = new Date(Date.now() - DAY_STARTS_AT * 3_600_000);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * `realClock` (with `test.use`): the page keeps the real time. For what the server dates with its own clock, as the
 * expiry of a signed image: from 4:00 to midday the page's midday is hours ahead, and every link would look expired.
 */
export const test = base.extend<{ realClock: boolean }>({
  realClock: [false, { option: true }],
  context: async ({ context, realClock }, run) => {
    if (!realClock) await context.clock.install({ time: middayOfToday() });
    await run(context);
  },
});
