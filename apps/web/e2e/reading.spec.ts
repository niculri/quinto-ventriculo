// E2e tests of how an article and a test read: their fonts already in when first drawn, the article's column and
// figures, and nothing moving while its images or the note arrive late.
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
    if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) return;
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

  const places = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.note-body > *, .note-body figure')].map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.height)];
      }),
    );
  const before = await places();
  expect(await page.evaluate(() => [...document.images].some((i) => !i.complete))).toBe(true);

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
  expect(layout.centered.length).toBeGreaterThanOrEqual(4);
  for (const offset of layout.centered) expect(offset).toBeLessThanOrEqual(1);
  expect(layout.floats.length).toBeGreaterThanOrEqual(4);
  if (isMobile) {
    expect(layout.floats.every((f) => f === 'none')).toBe(true);
  } else {
    expect(layout.floats.every((f) => f === 'right')).toBe(true);
    for (const edge of layout.rightEdges) expect(edge).toBeLessThanOrEqual(1);
    for (const width of layout.thumbWidths) expect(width).toBeLessThanOrEqual(COLUMN / 2 + 1);
    expect(layout.over).toEqual([]);
    for (const strip of layout.strips) expect(strip).toBeLessThanOrEqual(100);
  }

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

test('no figure is taller than the window under the site’s bars, caption included, and each keeps its shape', async ({
  page,
}) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 720 });
  await signIn(page);
  await page.goto('/dev/reading');
  await expect(
    page.getByRole('heading', { level: 1, name: 'La bomba de sodio y potasio' }),
  ).toBeVisible();
  const figures = await page.evaluate(() => {
    // The site's bar, and below lg the index's bar that sticks under it.
    const header = document.querySelector('header')!.getBoundingClientRect().height;
    const index = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.startsWith('Índice'),
    );
    const bar = index?.closest('.sticky');
    const height = bar?.getBoundingClientRect().height ?? 0;
    const bars = bar && height ? parseFloat(getComputedStyle(bar).top) + height : header;
    return [...document.querySelectorAll<HTMLElement>('.note-body figure')].map((f) => {
      const img = f.querySelector('img')!;
      const shape = Number(img.getAttribute('width')) / Number(img.getAttribute('height'));
      const box = img.getBoundingClientRect();
      return {
        room: window.innerHeight - bars,
        tall: f.getBoundingClientRect().height,
        drawn: box.width / box.height,
        shape,
      };
    });
  });
  expect(figures.some((f) => f.shape < 0.6)).toBe(true);
  for (const f of figures) {
    expect(f.tall).toBeLessThanOrEqual(f.room);
    expect(Math.abs(f.drawn - f.shape) / f.shape).toBeLessThan(0.02);
  }
});

test('the text stops at its measure on the column’s left edge, the wide figures and the tables use the whole column', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'on a phone the column is narrower than any measure');
  await signIn(page);
  const widths = async (measure: string) => {
    await page.goto(`/dev/reading${measure ? `?measure=${measure}` : ''}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'La bomba de sodio y potasio' }),
    ).toBeVisible();
    return page.evaluate(() => {
      const body = document.querySelector('.note-body')!.getBoundingClientRect();
      const widest = (selector: string) =>
        Math.max(
          ...[...document.querySelectorAll(selector)].map((e) => e.getBoundingClientRect().width),
        );
      const lefts = [...document.querySelectorAll('.note-body > p, .note-body > .callout')].map(
        (e) => e.getBoundingClientRect().left - body.left,
      );
      return {
        text: widest('.note-body > p, .note-body > ul, .note-body > ol, .note-body > .callout'),
        wide: widest('.note-body .table-scroll, .note-body > figure.is-wide'),
        column: body.width,
        lefts,
      };
    });
  };
  const standard = await widths('');
  expect(standard.text).toBeLessThanOrEqual(596.5);
  expect(standard.text).toBeGreaterThan(590);
  expect(standard.wide).toBeCloseTo(standard.column, 0);
  for (const left of standard.lefts) expect(Math.abs(left)).toBeLessThanOrEqual(1);
  expect((await widths('65')).text).toBeLessThanOrEqual(552.5);
  expect((await widths('75')).text).toBeLessThanOrEqual(640.5);
  expect((await widths('full')).text).toBeCloseTo(standard.column, 0);
});
