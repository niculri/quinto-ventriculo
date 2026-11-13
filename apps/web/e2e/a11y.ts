import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** WCAG 2.2 A and AA: the rules of the law and of the university, not axe's «best practices». */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * Runs axe on what is on screen and fails with each violation, its elements and why. A popup of Radix leaves the page
 * behind it with `aria-hidden`: axe looks at the popup.
 */
async function expectNoViolations(page: Page, label: string) {
  const builder = () => new AxeBuilder({ page }).withTags(TAGS);
  // A card is the note type's HTML and CSS, as in Anki (packages/anki-render): its colors are the author's, so its
  // contrast is not the site's to check. Everything else inside it is.
  const page_ = await builder().exclude('.qv-card').analyze();
  const cards = (await page.locator('.qv-card').count())
    ? await builder().include('.qv-card').disableRules(['color-contrast']).analyze()
    : { violations: [] };
  const violations = [...page_.violations, ...cards.violations];
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n${v.nodes
        .slice(0, 6)
        .map(
          (n) => `   ${n.target.join(' ')} → ${n.failureSummary?.split('\n').slice(1).join(' ')}`,
        )
        .join('\n')}`,
  );
  expect(report, `axe en ${label}`).toEqual([]);
}

/**
 * axe in the light theme and in the dark one, on the same screen: the site follows the system's theme when nobody
 * chose one, and changes it as ThemePicker does (the `dark` class on <html>), without reloading.
 */
export async function expectNoViolationsInBothThemes(page: Page, label: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle('dark', dark),
      scheme === 'dark',
    );
    await expectNoViolations(page, `${label} (${scheme === 'dark' ? 'oscuro' : 'claro'})`);
  }
}
