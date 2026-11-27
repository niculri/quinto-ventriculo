// E2e test of the drawings behind a course's cards: never under a letter of their card, at any width, also with an
// exam date and something turned on (the Anki card's longest lines), and with room on their right.
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { signIn } from './helpers';

const COURSES = [
  '/semesters/2/courses/biologia-celular',
  '/semesters/2/courses/anatomia-2',
  '/semesters/1/courses/anatomia-1',
];

/** Each card's drawing: the letters of its card it reaches, and how far its right edge is from the card's. */
const drawings = (page: Page) =>
  page.locator('main a.group').evaluateAll((cards) =>
    cards.map((card) => {
      const art = card.querySelector('svg.pointer-events-none')!;
      const half = Number.parseFloat(getComputedStyle(art).strokeWidth) / 2;
      let [left, top, right] = [Infinity, Infinity, -Infinity];
      for (const shape of art.querySelectorAll<SVGGraphicsElement>('path, rect, circle')) {
        const b = shape.getBBox();
        const m = shape.getScreenCTM()!;
        const scale = Math.hypot(m.a, m.b);
        for (const [x, y] of [
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x, b.y + b.height],
          [b.x + b.width, b.y + b.height],
        ] as const) {
          const px = m.a * x + m.c * y + m.e;
          const py = m.b * x + m.d * y + m.f;
          left = Math.min(left, px - half * scale);
          top = Math.min(top, py - half * scale);
          right = Math.max(right, px + half * scale);
        }
      }
      const box = card.getBoundingClientRect();
      const under: string[] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        const holder = text.parentElement!;
        if (!text.textContent?.trim() || holder.closest('.sr-only')) continue;
        if (getComputedStyle(holder).visibility === 'hidden') continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const r of range.getClientRects()) {
          if (r.right > left && r.left < right && r.bottom > top && r.top < box.bottom) {
            under.push(text.textContent.trim());
          }
        }
      }
      return {
        card: card.querySelector('h3')!.textContent,
        under,
        room: Math.round(box.right - right),
      };
    }),
  );

async function check(page: Page) {
  for (const url of COURSES) {
    await page.goto(url);
    await expect(page.locator('main a.group').first()).toBeVisible();
    // Every line of the cards in, not their gray stand-ins.
    await expect(page.locator('main a.group .animate-pulse')).toHaveCount(0);
    for (const d of await drawings(page)) {
      expect(d.under, `${url} · ${d.card}`).toEqual([]);
      expect(d.room, `${url} · ${d.card}`).toBeGreaterThanOrEqual(8);
    }
  }
}

test('the drawings behind the cards never go under their letters, at every width', async ({
  page,
  isMobile,
}) => {
  test.slow();
  await signIn(page);
  await check(page);
  // With a date, the Anki card of the week turned on says the days left over today's load.
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  const date = page.locator('input[type="date"]').first();
  await date.fill('2026-12-12');
  await date.blur();
  await page.goto('/semesters/1/courses/anatomia-1');
  await expect(page.getByText(/^Faltan \d+ días/)).toBeVisible();
  await check(page);
  if (isMobile) return;
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await check(page);
  }
});
