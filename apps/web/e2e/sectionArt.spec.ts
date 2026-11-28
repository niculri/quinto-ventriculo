// E2e test of the drawings behind a course's cards: they pass under the card's text, so in both themes, resting and
// hovered, the gray text over the drawing's darkest stroke keeps the contrast of WCAG AA; and they are decoration.
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { signIn } from './helpers';

const COURSES = ['/semesters/2/courses/biologia-celular', '/semesters/1/courses/anatomia-1'];

/** Each card's contrast between its gray text and the card's color under a full stroke of its drawing. */
const contrasts = (page: Page) =>
  page.locator('main a.group').evaluateAll((cards) => {
    const probe = document.createElement('canvas').getContext('2d')!;
    const rgb = (color: string) => {
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      return [...probe.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    return cards.map((card) => {
      const art = card.querySelector('svg.pointer-events-none')!;
      const style = getComputedStyle(art);
      const alpha = Number.parseFloat(style.opacity);
      const stroke = rgb(style.color);
      const under = rgb(getComputedStyle(card).backgroundColor).map(
        (v, i) => v * (1 - alpha) + (stroke[i] ?? 0) * alpha,
      );
      const text = luminance(rgb(getComputedStyle(card.querySelector('p')!).color));
      const [light, dark] = [text, luminance(under)].sort((a, b) => b - a) as [number, number];
      return {
        card: card.querySelector('h3')!.textContent,
        hidden: art.getAttribute('aria-hidden'),
        contrast: (light + 0.05) / (dark + 0.05),
      };
    });
  });

test('the text of a card keeps its contrast over the drawing behind it, in both themes', async ({
  page,
  isMobile,
}) => {
  test.slow();
  await signIn(page);
  for (const url of COURSES) {
    await page.goto(url);
    await expect(page.locator('main a.group').first()).toBeVisible();
    for (const dark of [false, true]) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      for (const hovered of isMobile ? [false] : [false, true]) {
        const cards = page.locator('main a.group');
        const count = await cards.count();
        for (let i = 0; i < count; i += 1) {
          if (hovered) await cards.nth(i).hover();
          const found = (await contrasts(page))[i]!;
          const label = `${url} · ${found.card} · ${dark ? 'dark' : 'light'}`;
          expect(found.hidden, label).toBe('true');
          expect(found.contrast, label).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }
});
