import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/** The article's column on a computer: the whole page (53rem). */
const COLUMN = 848;

/** The fonts at the moment `selector` first appears: an article or a test is never drawn with another font. */
function fontsAtFirstDraw(selector: string) {
  const w = window as unknown as { fontsAtFirstDraw: boolean[] | null };
  w.fontsAtFirstDraw = null;
  new MutationObserver((_, observer) => {
    if (!document.querySelector(selector)) return;
    w.fontsAtFirstDraw = [
      '400 16px "Inter Variable"',
      'italic 400 16px "Inter Variable"',
      '600 16px "Source Serif 4 Variable"',
    ].map((f) => document.fonts.check(f));
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
}

/** The italic arrives late, so that a page that does not wait for it would be drawn without it. */
async function lateItalic(page: Page) {
  await page.route(/inter-italic[^/]*\.woff2/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
}

/**
 * How an article reads (step 3.8), on the made-up article of /dev/reading (development only): Inter 17px (16 on the
 * phone) already loaded when it is first drawn, a column from the edge of the title and the breadcrumbs, its figures
 * as thumbnails on the right with the text beside them (nothing over them, no empty strip at their left) and the
 * wide ones centered, nothing floating on the phone, superscripts that look the same however they are written, and
 * nothing moves while its lazy images arrive late.
 */
test('an article: Inter in its column, thumbnails on the right, and its late images keep their room', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.route(/\.svg(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await lateItalic(page);
  await page.addInitScript(fontsAtFirstDraw, '.note-body');
  await page.addInitScript(() => {
    const w = window as unknown as { cls: number };
    w.cls = 0;
    if (!PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) return;
    // The article's own shifts (the TOC beside it opens its subsections while scrolling: that is not the article).
    type Shift = { hadRecentInput: boolean; value: number; sources: { node: Node | null }[] };
    const inArticle = (node: Node | null) =>
      !!(node instanceof Element ? node : node?.parentElement)?.closest('article');
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Shift[])
        if (!e.hadRecentInput && e.sources.some((s) => inArticle(s.node))) w.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/dev/reading');
  await expect(
    page.getByRole('heading', { level: 1, name: 'La bomba de sodio y potasio' }),
  ).toBeVisible();

  const text = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.note-body > p')!);
    return {
      size: style.fontSize,
      family: style.fontFamily,
      atFirstDraw: (window as unknown as { fontsAtFirstDraw: boolean[] | null }).fontsAtFirstDraw,
    };
  });
  expect(text.size).toBe(isMobile ? '16px' : '17px');
  expect(text.family).toMatch(/^"?Inter Variable"?,/);
  expect(text.atFirstDraw).toEqual([true, true, true]);

  // Where every block is before any image arrives.
  const places = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.note-body > *, .note-body figure')].map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.height)];
      }),
    );
  const before = await places();
  expect(await page.evaluate(() => [...document.images].some((i) => !i.complete))).toBe(true);

  // Down the whole article, so that every lazy image loads, and wait for them.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.note-body img')].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  expect(await places()).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBe(0);

  const layout = await page.evaluate(() => {
    const body = document.querySelector('.note-body')!.getBoundingClientRect();
    const center = body.left + body.width / 2;
    const off = (r: { left: number; right: number }) => Math.abs((r.left + r.right) / 2 - center);
    const thumbs = [...document.querySelectorAll<HTMLElement>('.note-body figure.is-thumb')];
    const pageThumbs = thumbs.filter((f) => !f.closest('.callout'));
    // The empty strip at the left of each thumbnail: from the last line of text beside it to its bottom.
    const strips: number[] = [];
    // Every line of text beside a thumbnail ends before it; every block beside it (a callout, a heading with a
    // bar) is narrowed to end before it too.
    const over: string[] = [];
    for (const figure of thumbs) {
      const f = figure.getBoundingClientRect();
      let last = f.top;
      const scope = figure.closest('.callout') ?? document.querySelector('.note-body')!;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (figure.contains(node) || !node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of range.getClientRects()) {
          if (line.bottom <= f.top + 1 || line.top >= f.bottom - 1) continue;
          if (line.right > f.left - 8) over.push(node.textContent.trim().slice(0, 30));
          else last = Math.max(last, line.bottom);
        }
      }
      for (const block of scope.querySelectorAll(':scope > .callout, :scope > h4')) {
        const b = block.getBoundingClientRect();
        if (b.bottom > f.top + 1 && b.top < f.bottom - 1 && b.right > f.left)
          over.push(block.className);
      }
      strips.push(f.bottom - last);
    }
    const wide = [
      ...document.querySelectorAll('.note-body figure.is-wide, .note-body .table-scroll'),
    ].map((e) => off(e.getBoundingClientRect()));
    const rows = [...document.querySelectorAll('.note-body .figure-row')].map((row) => {
      const parts = [...row.children].map((c) => c.getBoundingClientRect());
      return off({
        left: Math.min(...parts.map((p) => p.left)),
        right: Math.max(...parts.map((p) => p.right)),
      });
    });
    const left = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().left;
    return {
      width: body.width,
      floats: thumbs.map((f) => getComputedStyle(f).float),
      rightEdges: pageThumbs.map((f) => Math.abs(f.getBoundingClientRect().right - body.right)),
      thumbWidths: pageThumbs.map((f) => f.getBoundingClientRect().width),
      over,
      strips,
      centered: [...wide, ...rows],
      widest:
        Math.max(
          ...[...document.querySelectorAll('.note-body figure, .note-body .table-scroll')].map(
            (e) => e.getBoundingClientRect().right,
          ),
        ) - body.right,
      edges: [left('nav[aria-label="Ruta"]'), left('article h1'), left('.note-body > p')].map((x) =>
        Math.abs(x - body.left),
      ),
      header: document.querySelector('article header')!.getBoundingClientRect().width,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(layout.width).toBeLessThanOrEqual(COLUMN + 1);
  expect(Math.abs(layout.header - layout.width)).toBeLessThanOrEqual(1);
  for (const edge of layout.edges) expect(edge).toBeLessThanOrEqual(1);
  expect(layout.widest).toBeLessThanOrEqual(1);
  expect(layout.sideways).toBeLessThanOrEqual(0);
  // The wide figures, the row and the tables, centered in the column.
  expect(layout.centered.length).toBeGreaterThanOrEqual(4);
  for (const offset of layout.centered) expect(offset).toBeLessThanOrEqual(1);
  expect(layout.floats.length).toBeGreaterThanOrEqual(4);
  if (isMobile) {
    // On the phone nothing floats: each figure up to the screen's width, centered.
    expect(layout.floats.every((f) => f === 'none')).toBe(true);
  } else {
    expect(layout.floats.every((f) => f === 'right')).toBe(true);
    for (const edge of layout.rightEdges) expect(edge).toBeLessThanOrEqual(1);
    for (const width of layout.thumbWidths) expect(width).toBeLessThanOrEqual(COLUMN / 2 + 1);
    expect(layout.over).toEqual([]);
    // No empty strip beside a thumbnail: it goes where there is text beside it.
    for (const strip of layout.strips) expect(strip).toBeLessThanOrEqual(100);
  }

  // Superscripts and subscripts written in HTML look the same as their Unicode characters (the same glyphs, so the
  // same width), and none makes its line taller.
  const scripts = await page.evaluate(() => {
    const pairs: [string, string][] = [
      ['Ca²⁺', 'Ca<sup class="own-glyphs">2+</sup>'],
      ['10⁻⁹', '10<sup class="own-glyphs">−9</sup>'],
      ['Na⁺', 'Na<sup class="own-glyphs">+</sup>'],
      ['IP₃', 'IP<sub class="own-glyphs">3</sub>'],
      ['X⁽³⁾', 'X<sup class="own-glyphs">(3)</sup>'],
    ];
    const probe = document.createElement('p');
    document.querySelector('.note-body')!.append(probe);
    const result = pairs.map(([unicode, html]) => {
      probe.innerHTML = `<span>${unicode}</span> <span>${html}</span>`;
      const [a, b] = [...probe.children].map((s) => s.getBoundingClientRect().width);
      return Math.abs(a! - b!);
    });
    probe.innerHTML = 'V<sub>máx</sub> K<sub>M</sub> Ca<sup class="own-glyphs">2+</sup>';
    const line = parseFloat(getComputedStyle(probe).lineHeight);
    const tall = probe.getBoundingClientRect().height - line;
    probe.remove();
    return { result, tall };
  });
  for (const difference of scripts.result) expect(difference).toBeLessThanOrEqual(0.5);
  expect(Math.abs(scripts.tall)).toBeLessThanOrEqual(0.5);
});

/**
 * A note's own page (not /dev/reading): it is first drawn with its fonts in, and while it loads the breadcrumbs and
 * the title are already where the article puts them (on a phone the breadcrumbs wrap).
 */
test('an article page: drawn with its fonts, and its loading state keeps the breadcrumbs and the title in place', async ({
  page,
}) => {
  await signIn(page);
  await lateItalic(page);
  await page.addInitScript(fontsAtFirstDraw, '.note-body');
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/notes\//, async (route) => {
    await held;
    await route.continue();
  });
  // From the list, as a student arrives: the catalog is in, the note is not.
  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes');
  await page.getByRole('main').getByRole('link', { name: 'Traducción' }).first().click();
  const loading = page.getByRole('status', { name: 'Cargando el apunte' });
  await expect(loading).toBeVisible();
  const box = (selector: string) =>
    page.evaluate((s) => {
      const r = document.querySelector(s)!.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(Math.round);
    }, selector);
  const crumbs = await box('main nav[aria-label="Ruta"]');
  const title = await box('[aria-label="Cargando el apunte"] > div > div');
  release();
  await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
  expect(await box('main nav[aria-label="Ruta"]')).toEqual(crumbs);
  expect((await box('article h1')).slice(0, 2)).toEqual(title.slice(0, 2));
  expect(
    await page.evaluate(
      () => (window as unknown as { fontsAtFirstDraw: boolean[] | null }).fontsAtFirstDraw,
    ),
  ).toEqual([true, true, true]);
});

/** A test waits for its fonts as an article does: its questions are never drawn with another font. */
test('a test: its questions are first drawn with Inter, the italic too', async ({ page }) => {
  await signIn(page);
  await lateItalic(page);
  await page.addInitScript(fontsAtFirstDraw, '.quiz');
  await page.goto(
    '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica/pautas',
  );
  await expect(page.locator('.quiz').first()).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { fontsAtFirstDraw: boolean[] | null }).fontsAtFirstDraw,
    ),
  ).toEqual([true, true, true]);
});
