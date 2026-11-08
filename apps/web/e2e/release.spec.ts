import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

/**
 * Step 1.7, part 2: the release panel and the preview of the draft, with the e2e folder's draft (e2e/content/draft:
 * an article section rewritten with a calendar phrase, a card whose answer changes, a cloze whose extra does, a card
 * added and one taken out, a question whose key changes and one whose explanation does) and what the database gives
 * for it (e2e/content/release, written by db/tests/release.test.ts). The demo's user is an administrator.
 */
const PANEL = '/settings/admin/releases';
const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const DRAFT_TEXT = 'una mayor y una menor';

/** Where an element is on the page (not on the screen: opening something below scrolls it). */
const box = (l: Locator) =>
  l.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return {
      x: Math.round(b.x + window.scrollX),
      y: Math.round(b.y + window.scrollY),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  });

/** What of the top bar must not move: the logo, the search and the account. */
const bar = async (page: Page) => ({
  logo: await box(page.getByRole('link', { name: 'El Quinto Ventrículo, inicio' })),
  search: await box(page.getByRole('banner').getByRole('button', { name: /Buscar en la página/ })),
  account: await box(page.getByRole('button', { name: 'Tu cuenta' })),
});

/**
 * Goes to a page inside the app, without loading it again (as a link does): what the app keeps in memory stays.
 * Revisión de cero (1.7, parte 2).
 */
const within = (page: Page, path: string) =>
  page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function openPanel(page: Page) {
  await signIn(page);
  await page.goto(PANEL);
  await expect(page.getByRole('heading', { level: 2, name: 'Publicaciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lista de revisión' })).toBeVisible();
}

test('the panel: the review list and what changes, by assessment, with its before and after', async ({
  page,
}) => {
  await openPanel(page);
  const title = page.getByRole('heading', { level: 2, name: 'Publicaciones' });
  const first = await box(title);

  // The review list: the lecture without its year stops it; the calendar phrase and the cards out and in warn.
  await expect(
    page.getByRole('status').filter({ hasText: 'Hay 1 regla que impide publicar.' }),
  ).toBeVisible();
  const rule = (id: string) => page.locator(`[data-rule="${id}"]`);
  await expect(rule('class_without_year')).toContainText('AP-BC-C2-10');
  await expect(rule('process_phrase')).toContainText('este semestre');
  await expect(rule('guid_maybe')).toContainText('sale 1 nota y entra 1');
  await expect(rule('missing_image')).toContainText('Bien');
  await expect(rule('guid_changed')).toContainText('Bien');

  // A mark by hand, tied to this draft.
  const phone = page.getByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
  await phone.check();
  await expect(page.getByText('Marcada por demo@ug.uchile.cl')).toBeVisible();

  // What changes: the assessments, and the before and after of the cards.
  const anatomy = page.getByRole('article', { name: 'Anatomía I · Certamen 1' });
  await expect(anatomy).toContainText('2 pueden cambiar la respuesta');
  await expect(anatomy).toContainText('1 nueva');
  await anatomy.getByRole('button', { name: /^Tarjetas/ }).click();
  const changed = anatomy.getByRole('listitem').filter({ hasText: 'T-PR-01-001 · .2 → .3' });
  await expect(changed).toContainText('Puede cambiar la respuesta');
  await expect(changed.locator('del')).toHaveText(['T-PR-01-001.2', '7']);
  await expect(changed.locator('ins')).toHaveText(['T-PR-01-001.3', 'Siete']);

  const biocel = page.getByRole('article', { name: 'Biología celular · Certamen 2' });
  await expect(biocel).toContainText('1 cambia la clave');
  await biocel.getByRole('button', { name: /^Preguntas/ }).click();
  await expect(biocel.getByText('La correcta era la a) y ahora es la b)')).toBeVisible();
  await biocel.getByRole('button', { name: /^Artículos/ }).click();
  await expect(biocel.locator('ins').filter({ hasText: 'mayor' })).toBeVisible();

  // Nothing above moved while it loaded and opened, and the page fits its width.
  expect(await box(title)).toEqual(first);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

test('the preview: the whole site with the draft, entered and left from the panel, without moving anything', async ({
  page,
}) => {
  await openPanel(page);
  const study = () => page.evaluate(() => window.localStorage.getItem('qv-demo-study'));
  const before = await study();
  const barBefore = await bar(page);
  const title = await box(page.getByRole('heading', { level: 2, name: 'Publicaciones' }));
  const toggle = page.getByRole('switch', { name: 'Ver el sitio con el borrador' });

  // In: the mark in the bar, nothing moved.
  await toggle.check();
  await expect(page.locator('[data-preview-mark]')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Estás viendo el borrador' }),
  ).toBeAttached();
  expect(await bar(page)).toEqual(barBefore);
  expect(await box(page.getByRole('heading', { level: 2, name: 'Publicaciones' }))).toEqual(title);

  // The draft, on the site: the rewritten section of the article.
  await page.goto(ARTICLE);
  await expect(page.getByText(DRAFT_TEXT)).toBeVisible();
  await expect(page.locator('[data-preview-mark]')).toBeVisible();

  // Studying in the preview writes nothing.
  await page.goto(`${DECK_URL}/study`);
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.getByRole('region', { name: 'Reverso de la tarjeta' })).toContainText('Siete');
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();
  expect(await study()).toBe(before);

  // Out, from the panel: the published site again, and nothing of the draft stays. Revisión de cero (1.7, parte 2):
  // the article read in the preview without loading the page again, and after leaving, again without loading it: what
  // the app keeps in memory (its cache) is not the draft's.
  await page.goto(PANEL);
  await within(page, ARTICLE);
  await expect(page.getByText(DRAFT_TEXT)).toBeVisible();
  await within(page, PANEL);
  await expect(page.getByRole('heading', { level: 2, name: 'Publicaciones' })).toBeVisible();
  const barIn = await bar(page);
  await page.getByRole('switch', { name: 'Ver el sitio con el borrador' }).uncheck();
  await expect(page.locator('[data-preview-mark]')).toHaveCount(0);
  expect(await bar(page)).toEqual(barIn);
  expect(await page.evaluate(() => window.sessionStorage.getItem('qv-preview'))).toBeNull();
  await within(page, ARTICLE);
  await expect(page.getByRole('heading', { level: 1, name: /Traducción/ })).toBeVisible();
  await expect(page.getByText(DRAFT_TEXT)).toHaveCount(0);
  await page.getByRole('link', { name: 'El Quinto Ventrículo, inicio' }).click();
  await page.goto(ARTICLE);
  await expect(page.getByRole('heading', { level: 1, name: /Traducción/ })).toBeVisible();
  await expect(page.getByText(DRAFT_TEXT)).toHaveCount(0);
  expect(await study()).toBe(before);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

/**
 * Where the page's headings, list items and links are, frame by frame, while `act` runs and a little after: each one
 * that was somewhere else, or not there, at some frame. Revisión de cero (1.7, parte 2).
 */
async function movedWhile(page: Page, act: () => Promise<void>) {
  const SEL = 'nav a, nav button, main h2, main h3, main li, header a, header button';
  const read = () =>
    page.evaluate(
      (sel) =>
        [...document.querySelectorAll(sel)].map((e) => {
          const b = e.getBoundingClientRect();
          const where = [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round).join(',');
          return `${e.textContent?.trim().slice(0, 40)}@${where}`;
        }),
      SEL,
    );
  const before = await read();
  await page.evaluate((sel) => {
    const w = window as unknown as { frames_: string[][] };
    w.frames_ = [];
    const take = () => {
      w.frames_.push(
        [...document.querySelectorAll(sel)].map((e) => {
          const b = e.getBoundingClientRect();
          const where = [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round).join(',');
          return `${e.textContent?.trim().slice(0, 40)}@${where}`;
        }),
      );
      if (w.frames_.length < 90) requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, SEL);
  await act();
  await page.waitForTimeout(1600);
  const frames = await page.evaluate(() => (window as unknown as { frames_: string[][] }).frames_);
  return [...new Set(frames.flatMap((f) => before.filter((x) => !f.includes(x))))];
}

test('Revisión de cero (1.7, parte 2): entering and leaving the preview moves nothing at any frame, also after a reload', async ({
  page,
}) => {
  await openPanel(page);
  const toggle = page.getByRole('switch', { name: 'Ver el sitio con el borrador' });
  await page.waitForTimeout(800);
  expect(await movedWhile(page, () => toggle.check())).toEqual([]);
  expect(await movedWhile(page, () => toggle.uncheck())).toEqual([]);
  // Opened in the preview (the site's cache is empty): leaving it does not take the page off the screen.
  await toggle.check();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Lista de revisión' })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await movedWhile(page, () => toggle.uncheck())).toEqual([]);
});

test('a reload in the preview stays in it, and in a new tab it is not', async ({
  page,
  context,
}) => {
  await openPanel(page);
  await page.getByRole('switch', { name: 'Ver el sitio con el borrador' }).check();
  await page.reload();
  await expect(page.locator('[data-preview-mark]')).toBeVisible();
  const other = await context.newPage();
  await other.goto(ARTICLE);
  await expect(other.getByRole('heading', { level: 1, name: /Traducción/ })).toBeVisible();
  await expect(other.locator('[data-preview-mark]')).toHaveCount(0);
  await expect(other.getByText(DRAFT_TEXT)).toHaveCount(0);
});

/**
 * Where each element is (page coordinates, no text), at every frame while `act` runs: one box each if nothing moved.
 * Step 1.7, part 3.
 */
async function boxesWhile(page: Page, selectors: string[], act: () => Promise<void>) {
  await page.evaluate((sels) => {
    const w = window as unknown as { boxes_: Record<string, string[]> };
    w.boxes_ = Object.fromEntries(sels.map((s) => [s, []]));
    let n = 0;
    const take = () => {
      for (const s of sels) {
        const e = document.querySelector(s);
        const b = e?.getBoundingClientRect();
        const where = b
          ? [b.x, b.y + window.scrollY, b.width, b.height].map(Math.round).join(',')
          : 'none';
        if (!w.boxes_[s]!.includes(where)) w.boxes_[s]!.push(where);
      }
      if (++n < 120) requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, selectors);
  await act();
  await page.waitForTimeout(1600);
  return page.evaluate(() => (window as unknown as { boxes_: Record<string, string[]> }).boxes_);
}

test('publishing and undoing, each from its own popup, without moving what is above', async ({
  page,
}) => {
  // Never the browser's confirm.
  const browserDialogs: string[] = [];
  page.on('dialog', (d) => {
    browserDialogs.push(d.type());
    void d.dismiss();
  });
  // The demo's draft has a rule that stops it: here it is the same draft, ready, and publishing and undoing are
  // answered here (the database's part is db/tests/publish.test.ts), so the other tests keep the demo's draft.
  let state: 'draft' | 'published' | 'reverted' = 'draft';
  const sent: unknown[] = [];
  const record = (status: 'published' | 'reverted') => ({
    id: 1,
    status,
    title: 'Anatomía I · Certamen 1 y Biología celular · Certamen 2',
    schemaVersion: 1,
    publishedAt: '2026-11-07T15:00:00.000+00:00',
    publishedBy: 'demo@ug.uchile.cl',
    revertedAt: status === 'reverted' ? '2026-11-07T15:10:00.000+00:00' : null,
    revertedBy: status === 'reverted' ? 'demo@ug.uchile.cl' : null,
    changes: {},
    canRevert: status === 'published',
  });
  const MARKS = [
    { mark: 'answers', checkedBy: 'demo@ug.uchile.cl', checkedAt: '2026-11-07T15:00:00Z' },
    { mark: 'phone', checkedBy: 'demo@ug.uchile.cl', checkedAt: '2026-11-07T15:00:00Z' },
  ];
  await page.route('**/api/admin/release', async (route) => {
    const response = await route.fetch();
    const o = (await response.json()) as { summary: Record<string, unknown> };
    const s = o.summary;
    o.summary =
      state === 'published'
        ? {
            ...s,
            fingerprint: 'f'.repeat(32),
            marks: [],
            assessments: [],
            catalog: [],
            noteTypes: [],
            presets: [],
            decks: [],
            findings: [],
          }
        : {
            ...s,
            marks: MARKS,
            findings: (s.findings as { rule: string }[]).filter(
              (f) => f.rule !== 'class_without_year',
            ),
          };
    await route.fulfill({ response, json: o });
  });
  await page.route('**/api/admin/releases', (route) =>
    route.fulfill({
      json: {
        releases:
          state === 'draft' ? [] : [record(state === 'published' ? 'published' : 'reverted')],
      },
    }),
  );
  await page.route('**/api/admin/release/publish', async (route) => {
    sent.push(route.request().postDataJSON());
    await page.waitForTimeout(400);
    state = 'published';
    await route.fulfill({
      json: {
        id: 1,
        title: record('published').title,
        publishedAt: '2026-11-07T15:00:00Z',
        changes: {},
      },
    });
  });
  await page.route('**/api/admin/release/revert', async (route) => {
    sent.push(route.request().postDataJSON());
    await page.waitForTimeout(400);
    state = 'reverted';
    await route.fulfill({ json: { id: 1, revertedAt: '2026-11-07T15:10:00Z', changes: {} } });
  });

  await signIn(page);
  const ABOVE = [
    'main h2.font-serif',
    'main section[aria-labelledby="preview"]',
    'main section[aria-labelledby="last-release"]',
  ];
  // Loading (going there inside the app, as a link does): the last publication's card is there from the start, with
  // its height.
  const loading = await boxesWhile(page, ABOVE, async () => {
    await within(page, PANEL);
    await expect(
      page.getByText('Todavía no hay publicaciones.', { exact: true }).first(),
    ).toBeVisible();
  });
  for (const s of ABOVE.slice(1)) {
    expect(
      loading[s]!.filter((b) => b !== 'none'),
      s,
    ).toHaveLength(1);
  }

  const publish = page.getByRole('button', { name: 'Publicar', exact: true });
  await expect(publish).toBeEnabled();
  const bar = await box(publish);
  // Publishing: its popup says what goes, and nothing above moves (also while the popup is open).
  const publishing = await boxesWhile(page, ABOVE, async () => {
    await publish.click();
    const dialog = page.getByRole('alertdialog', { name: '¿Publicar el borrador?' });
    await expect(dialog).toContainText('Anatomía I · Certamen 1 y Biología celular · Certamen 2');
    await expect(dialog).toContainText('Biología celular · Certamen 2:');
    expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
    // Its label is in the middle of the button (the reserved width of «Publicando…» pushed it to the right).
    const offCenter = await dialog.getByRole('button', { name: 'Publicar' }).evaluate((b) => {
      const label = [...b.querySelectorAll('span')].find(
        (s) => s.textContent === 'Publicar' && !s.closest('[aria-hidden="true"]'),
      )!;
      const outer = b.getBoundingClientRect();
      const inner = label.getBoundingClientRect();
      return Math.abs(outer.left + outer.width / 2 - (inner.left + inner.width / 2));
    });
    expect(offCenter).toBeLessThanOrEqual(1);
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(dialog.getByRole('button', { name: 'Publicando…' })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/N\.º 1 · Anatomía I/).first()).toBeVisible();
  });
  for (const s of ABOVE) expect(publishing[s], s).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    title: 'Anatomía I · Certamen 1 y Biología celular · Certamen 2',
    checks: { blocking: 0, ready: true },
  });
  await expect(page.getByText(/El borrador es igual a lo publicado/)).toBeVisible();

  // Undoing: the same, from its own popup.
  const undo = page.getByRole('button', { name: 'Deshacer la última publicación' });
  await expect(undo).toBeEnabled();
  const undoing = await boxesWhile(page, ABOVE, async () => {
    await undo.click();
    const dialog = page.getByRole('alertdialog', { name: '¿Deshacer la publicación n.º 1?' });
    await dialog.getByRole('button', { name: 'Deshacer' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Deshecha el/).first()).toBeVisible();
  });
  for (const s of ABOVE) expect(undoing[s], s).toHaveLength(1);
  expect(sent[1]).toEqual({ id: 1 });
  await expect(undo).toBeDisabled();
  // The draft's differences are back, with «Publicar» where it was.
  await expect(publish).toBeEnabled();
  expect(await box(publish)).toEqual(bar);
  expect(browserDialogs).toEqual([]);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});
