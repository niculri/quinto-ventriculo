// E2e tests of how an article and a test read: their fonts already in when first drawn, the article's column and
// figures, and nothing moving while its images or the note arrive late.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/** The article's column on a computer: the whole page (53rem). */
const COLUMN = 848;

/** The fonts of a test, and an article's (its text is QV Sans). */
const TEST_FACES = [
  '400 16px "Inter Variable"',
  'italic 400 16px "Inter Variable"',
  '600 16px "Source Serif 4 Variable"',
];
const ARTICLE_FACES = [...TEST_FACES, '400 16px "QV Sans"', 'italic 400 16px "QV Sans"'];

/** The fonts at the moment `selector` first appears: an article or a test is never drawn with another font. */
function fontsAtFirstDraw({ selector, faces }: { selector: string; faces: string[] }) {
  const w = window as unknown as { fontsAtFirstDraw: boolean[] | null };
  w.fontsAtFirstDraw = null;
  new MutationObserver((_, observer) => {
    if (!document.querySelector(selector)) return;
    w.fontsAtFirstDraw = faces.map((f) => document.fonts.check(f));
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
}

/** The italics arrive late, so that a page that does not wait for them would be drawn without them. */
async function lateItalic(page: Page) {
  await page.route(/(inter|qv-sans)-italic[^/]*\.woff2/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
}

test('an article: QV Sans in its column, thumbnails on the right, and its late images keep their room', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.route(/\.svg(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await lateItalic(page);
  await page.addInitScript(fontsAtFirstDraw, { selector: '.note-body', faces: ARTICLE_FACES });
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
  expect(text.size).toBe('17px');
  expect(text.family).toMatch(/^"?QV Sans"?,/);
  expect(text.atFirstDraw).toEqual(ARTICLE_FACES.map(() => true));

  const places = () =>
    page.evaluate(() =>
      // A gallery's slides have no box of their own (their image and caption go in its grid).
      [...document.querySelectorAll('.note-body > *, .note-body figure:not(.gallery-slide)')].map(
        (e) => {
          const r = e.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.height)];
        },
      ),
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
      ...document.querySelectorAll(
        '.note-body figure.is-wide, .note-body .table-scroll:not(.is-beside)',
      ),
    ].map((e) => off(e.getBoundingClientRect()));
    // A short table beside a thumbnail ends before it.
    const beside = [...document.querySelectorAll('.note-body .table-scroll.is-beside')].map(
      (table) => {
        const t = table.getBoundingClientRect();
        return pageThumbs.some((f) => {
          const r = f.getBoundingClientRect();
          return r.top < t.bottom && r.bottom > t.top && t.right <= r.left;
        });
      },
    );
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
      beside,
      // The sign that a tap enlarges a thumbnail is in its caption, never over its image.
      icons: pageThumbs.map(
        (f) =>
          getComputedStyle(f, '::after').content === 'none' &&
          getComputedStyle(f.querySelector('figcaption')!, '::after').content !== 'none',
      ),
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
  // On a phone the figures take the screen's width, past the text's 16 px margin.
  expect(layout.widest).toBeLessThanOrEqual(isMobile ? 17 : 1);
  expect(layout.sideways).toBeLessThanOrEqual(0);
  expect(layout.centered.length).toBeGreaterThanOrEqual(4);
  for (const offset of layout.centered) expect(offset).toBeLessThanOrEqual(1);
  expect(layout.floats.length).toBeGreaterThanOrEqual(4);
  if (isMobile) {
    expect(layout.floats.every((f) => f === 'none')).toBe(true);
  } else {
    expect(layout.floats.every((f) => f === 'right')).toBe(true);
    for (const edge of layout.rightEdges) expect(edge).toBeLessThanOrEqual(1);
    for (const width of layout.thumbWidths) expect(width).toBeLessThanOrEqual(COLUMN * 0.4 + 1);
    expect(layout.over).toEqual([]);
    for (const strip of layout.strips) expect(strip).toBeLessThanOrEqual(100);
    expect(layout.beside).toEqual([true]);
    expect(layout.icons.every(Boolean)).toBe(true);
  }

  // Where the letter is Inter (a caption), its own glyphs draw <sup>/<sub> as wide as the Unicode ones; in QV Sans
  // text they shrink as the others do. Neither changes a line's height.
  const scripts = await page.evaluate(() => {
    const pairs: [string, string][] = [
      ['Ca²⁺', 'Ca<sup class="own-glyphs">2+</sup>'],
      ['10⁻⁹', '10<sup class="own-glyphs">−9</sup>'],
      ['Na⁺', 'Na<sup class="own-glyphs">+</sup>'],
      ['IP₃', 'IP<sub class="own-glyphs">3</sub>'],
      ['X⁽³⁾', 'X<sup class="own-glyphs">(3)</sup>'],
    ];
    const caption = document.createElement('figcaption');
    const probe = document.createElement('p');
    document.querySelector('.note-body')!.append(caption, probe);
    const result = pairs.map(([unicode, html]) => {
      caption.innerHTML = `<span>${unicode}</span> <span>${html}</span>`;
      const [a, b] = [...caption.children].map((s) => s.getBoundingClientRect().width);
      return Math.abs(a! - b!);
    });
    const tall = [caption, probe].map((el) => {
      el.innerHTML = 'V<sub>máx</sub> K<sub>M</sub> Ca<sup class="own-glyphs">2+</sup>';
      return el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).lineHeight);
    });
    caption.remove();
    probe.remove();
    return { result, tall };
  });
  for (const difference of scripts.result) expect(difference).toBeLessThanOrEqual(0.5);
  for (const tall of scripts.tall) expect(Math.abs(tall)).toBeLessThanOrEqual(0.5);
});

test('an article page: drawn with its fonts, and its loading state keeps the breadcrumbs and the title in place', async ({
  page,
}) => {
  await signIn(page);
  await lateItalic(page);
  await page.addInitScript(fontsAtFirstDraw, { selector: '.note-body', faces: ARTICLE_FACES });
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
  ).toEqual(ARTICLE_FACES.map(() => true));
});

test('a test: its questions are first drawn with Inter, the italic too', async ({ page }) => {
  await signIn(page);
  await lateItalic(page);
  await page.addInitScript(fontsAtFirstDraw, { selector: '.quiz', faces: TEST_FACES });
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

/** Each figure of the test article: the room under the bars (the site's, and below xl the index's), its height and shape. */
async function figureFit(page: Page) {
  await expect(
    page.getByRole('heading', { level: 1, name: 'La bomba de sodio y potasio' }),
  ).toBeVisible();
  return page.evaluate(() => {
    const header = document.querySelector('header')!.getBoundingClientRect().height;
    const index = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.startsWith('Índice'),
    );
    const bar = index?.closest('.sticky');
    const height = bar?.getBoundingClientRect().height ?? 0;
    const bars = bar && height ? parseFloat(getComputedStyle(bar).top) + height : header;
    return [...document.querySelectorAll<HTMLElement>('.note-body figure')].map((f) => {
      const img = f.querySelector('img')!;
      // A gallery's images share the box of its tallest one, and each is drawn whole inside it.
      const gallery = f.closest<HTMLElement>('.gallery');
      const shape = gallery
        ? Number(gallery.style.getPropertyValue('--ar'))
        : Number(img.getAttribute('width')) / Number(img.getAttribute('height'));
      const box = img.getBoundingClientRect();
      return {
        room: window.innerHeight - bars,
        tall: f.getBoundingClientRect().height,
        imageTall: box.height,
        plate: f.classList.contains('figure-plate'),
        drawn: box.width / box.height,
        shape,
      };
    });
  });
}

test('no figure is taller than the window under the site’s bars, caption included, and each keeps its shape', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  // On the desktop also between lg and xl, where the index's bar is under the site's one.
  for (const width of isMobile
    ? [page.viewportSize()!.width]
    : [page.viewportSize()!.width, 1100]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/dev/reading');
    const figures = await figureFit(page);
    expect(figures.some((f) => f.shape < 0.6)).toBe(true);
    for (const f of figures) {
      expect(f.tall).toBeLessThanOrEqual(f.room);
      expect(Math.abs(f.drawn - f.shape) / f.shape).toBeLessThan(0.02);
    }
  }
});

test('in a very short window a tall plate does not become a stamp: it keeps 20rem of height', async ({
  page,
}) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 360 });
  await signIn(page);
  await page.goto('/dev/reading');
  const tallest = (await figureFit(page)).filter((f) => f.plate && f.shape < 0.6);
  expect(tallest.length).toBeGreaterThan(0);
  for (const f of tallest) expect(f.imageTall).toBeGreaterThanOrEqual(319);
});

test('the text, the wide figures and the tables fill the column, as on Wikipedia', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'on a phone the figures take the screen’s width, past the text’s margin');
  await signIn(page);
  const widths = async () => {
    await page.goto('/dev/reading');
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
  const standard = await widths();
  expect(standard.text).toBeCloseTo(standard.column, 0);
  expect(standard.wide).toBeCloseTo(standard.column, 0);
  for (const left of standard.lefts) expect(Math.abs(left)).toBeLessThanOrEqual(1);
});

test('a gallery: its arrows right under the image, its slides of one height, and nothing moves when stepping', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/dev/reading');
  const gallery = page.locator('.note-body .gallery');
  await expect(gallery).toHaveCount(1);
  await gallery.scrollIntoViewIfNeeded();
  const state = () =>
    page.evaluate(() => {
      const g = document.querySelector('.note-body .gallery')!;
      const images = [...g.querySelectorAll('.gallery-slide > img')].map((i) =>
        i.getBoundingClientRect(),
      );
      const nav = g.querySelector('.gallery-nav')!.getBoundingClientRect();
      const visible = [...g.querySelectorAll('.gallery-slide')].map(
        (s) => getComputedStyle(s.querySelector('img')!).visibility,
      );
      const places = [...document.querySelectorAll('.note-body > *')].map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      });
      return {
        heights: images.map((r) => Math.round(r.height)),
        gap: nav.top - images[0]!.bottom,
        visible,
        count: g.querySelector('.gallery-count')!.textContent,
        places,
      };
    });
  const first = await state();
  expect(new Set(first.heights).size).toBe(1);
  expect(first.gap).toBeLessThanOrEqual(12);
  expect(first.visible).toEqual(['visible', 'hidden']);
  expect(first.count).toBe('1 de 2');
  await gallery.getByRole('button', { name: 'Imagen siguiente' }).click();
  const second = await state();
  expect(second.visible).toEqual(['hidden', 'visible']);
  expect(second.count).toBe('2 de 2');
  expect(second.places).toEqual(first.places);
  expect(second.heights).toEqual(first.heights);
});
