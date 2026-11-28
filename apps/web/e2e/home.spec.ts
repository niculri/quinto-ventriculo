// E2e tests of the home page: the first steps, «Hoy» counted without downloading any deck, «Seguir», «Tus ramos», the
// one-time tips, and that nothing moves while it loads.
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { ACCEPTED_ACCOUNT, ONLY_ACCEPTED, PORT } from './accepted';
import { DECK_URL, signIn } from './helpers';

const COURSE_URL = '/semesters/1/courses/anatomia-1';
const WEEK_ID = '1006809718735317183';
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

/** A student in the simple mode with the test content's week on (the welcome already closed). */
const WEEK_ON = {
  cookies: [],
  origins: [
    {
      origin: `http://localhost:${PORT}`,
      localStorage: [
        ACCEPTED_ACCOUNT,
        {
          name: 'qv-demo-study',
          value: JSON.stringify({
            preferences: { welcomeSeen: true },
            activations: [{ deckId: WEEK_ID, active: true }],
          }),
        },
      ],
    },
  ],
};

const today = (page: Page) => page.getByRole('region', { name: 'Hoy' });
const load = (page: Page) => today(page).getByRole('button', { name: /para hoy · ~\d+ min/ });

async function homeLoad(page: Page) {
  const text = (await load(page).textContent())!;
  // The breakdown is hidden until it is opened: read from the page, not from the accessibility tree.
  const breakdown = await today(page)
    .locator('[role="status"]')
    .evaluate((e) =>
      [...e.querySelectorAll(':scope > span > span:last-child')].map((x) => x.textContent),
    );
  return `${text} (${breakdown.join('+')})`;
}

async function studyLoad(page: Page) {
  // The study bar says the load in full (and in short on a phone, «4 · ~2 min»), with the breakdown beside it.
  const text = await page
    .getByText(/para hoy · ~\d+ min/)
    .first()
    .evaluate((e) => e.textContent);
  const line = page.locator('span[title^="Nuevas:"]').first();
  const breakdown = /Nuevas: (\d+) · Aprendiendo: (\d+) · A repasar: (\d+)/.exec(
    (await line.textContent())!,
  )!;
  return `${text.trim()} (${breakdown.slice(1).join('+')})`;
}

function deckReads(page: Page) {
  const reads: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/decks')) reads.push(path);
  });
  return reads;
}

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { shift_: number };
    w.shift_ = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!e.hadRecentInput) w.shift_ += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const shift = (page: Page) => page.evaluate(() => (window as unknown as { shift_: number }).shift_);

test.describe('a student who just arrived', () => {
  test.use({ storageState: ONLY_ACCEPTED });

  test('completes the first steps without the help, and each one is marked by itself', async ({
    page,
  }) => {
    await signIn(page);
    const steps = page.getByRole('region', { name: 'Primeros pasos' });
    await expect(steps.getByText('(pendiente)')).toHaveCount(3);
    await expect(today(page)).toContainText('Todavía no activas nada de lo que estás viendo');

    await steps.getByRole('link', { name: 'Elegir ramos' }).click();
    await page.getByRole('button', { name: /¿En qué semestre estás\?/ }).click();
    await page.getByRole('menuitemradio', { name: '1° Semestre' }).click();
    await expect(steps.getByText('Elige tus ramos (hecho)')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Tus ramos' }).getByRole('link', { name: /Anatomía I/ }),
    ).toBeVisible();

    await steps.getByRole('link', { name: 'Ir a tu ramo' }).click();
    await expect(page).toHaveURL(new RegExp(`${COURSE_URL}$`));
    const week = page.getByRole('switch', { name: 'Activar S1 - Semana de prueba' });
    await week.click();
    await expect(week).toBeChecked();
    await page.goto('/home');
    await expect(steps.getByText(/Activa lo que estás viendo en clases \(hecho\)/)).toBeVisible();
    await expect(load(page)).toBeVisible();

    await steps.getByRole('link', { name: 'Estudiar' }).click();
    const welcome = page.getByRole('dialog', { name: 'Cómo se estudia aquí' });
    await welcome.getByRole('button', { name: 'Entendido' }).click();
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.getByRole('button', { name: /^Bien/ }).click();
    await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
    await page.goto('/home');
    await expect(load(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Primeros pasos' })).toHaveCount(0);
  });

  test('«Ocultar» takes the first steps away, also after reloading', async ({ page }) => {
    await signIn(page);
    const steps = page.getByRole('region', { name: 'Primeros pasos' });
    await steps.getByRole('button', { name: 'Ocultar' }).click();
    await expect(steps).toHaveCount(0);
    await page.reload();
    await expect(today(page)).toBeVisible();
    await expect(steps).toHaveCount(0);
  });
});

/**
 * Where an element is in the page (not in the window: clicking can scroll), to the pixel: on the phone (2,625 device
 * pixels a pixel) a scroll leaves the sum of its fractions a pixel off.
 */
const placeOf = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top + window.scrollY) };
  });
const samePlaces = (a: Record<string, { x: number; y: number }>, b: typeof a) => {
  for (const k of Object.keys(b)) {
    expect(Math.abs(a[k]!.x - b[k]!.x), k).toBeLessThanOrEqual(1);
    expect(Math.abs(a[k]!.y - b[k]!.y), k).toBeLessThanOrEqual(1);
  }
};

test.describe('«Tus ramos»: adding and taking out courses', () => {
  test.use({ storageState: ONLY_ACCEPTED });

  test('a course of another semester is added and taken out, on every visit, and nothing moves', async ({
    page,
  }) => {
    await watchShifts(page);
    await signIn(page);
    const mine = page.getByRole('region', { name: 'Tus ramos' });
    await mine.getByRole('button', { name: /¿En qué semestre estás\?/ }).click();
    await page.getByRole('menuitemradio', { name: '1° Semestre' }).click();
    const anatomy = mine.getByRole('link', { name: /Anatomía I/ });
    await expect(anatomy).toBeVisible();

    const semester = mine.getByRole('button', { name: /¿En qué semestre estás\?/ });
    const add = mine.getByRole('button', { name: /Agregar un ramo de otro semestre/ });
    const places = async () => ({
      semester: await placeOf(semester),
      add: await placeOf(add),
      anatomy: await placeOf(anatomy),
    });
    const before = await places();

    await add.click();
    await page.getByRole('menuitemradio', { name: /Biología celular · 2° Semestre/ }).click();
    const biology = mine.getByRole('link', { name: /Biología celular/ });
    await expect(biology).toBeVisible();
    samePlaces(await places(), before);

    await page.reload();
    await expect(biology).toBeVisible();
    samePlaces(await places(), before);

    await mine.getByRole('button', { name: 'Quitar Biología celular de tus ramos' }).click();
    await expect(biology).toHaveCount(0);
    await expect(add).toBeFocused();
    samePlaces(await places(), before);
    await page.reload();
    await expect(anatomy).toBeVisible();
    await expect(biology).toHaveCount(0);
    await add.click();
    await expect(
      page.getByRole('menuitemradio', { name: /Biología celular · 2° Semestre/ }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await shift(page)).toBeLessThan(0.02);

    await semester.click();
    await page.getByRole('menuitemradio', { name: '2° Semestre' }).click();
    await expect(mine.getByText('Próximamente: Física.')).toBeVisible();
    await expect(mine.getByRole('link', { name: /Física/ })).toHaveCount(0);
    // Biología celular is of that semester, but it was taken out: it stays out until it is added again.
    await expect(biology).toHaveCount(0);
    await add.click();
    await page.getByRole('menuitemradio', { name: /Biología celular · 2° Semestre/ }).click();
    await expect(biology).toBeVisible();
  });
});

test.describe('«Tus ramos» with a week on', () => {
  test.use({ storageState: WEEK_ON });

  test('a course with something on comes by itself; taken out, «Hoy» still shows it', async ({
    page,
  }) => {
    await signIn(page);
    const mine = page.getByRole('region', { name: 'Tus ramos' });
    // No semester chosen: Anatomía I is there because of its week on.
    await expect(mine.getByRole('link', { name: /Anatomía I/ })).toBeVisible();
    await mine.getByRole('button', { name: 'Quitar Anatomía I de tus ramos' }).click();
    await expect(mine.getByRole('link', { name: /Anatomía I/ })).toHaveCount(0);
    await expect(today(page).getByRole('link', { name: /Anatomía I/ })).toBeVisible();
    await page.reload();
    await expect(load(page)).toBeVisible();
    await expect(mine.getByRole('link', { name: /Anatomía I/ })).toHaveCount(0);
    await expect(today(page).getByRole('link', { name: /Anatomía I/ })).toBeVisible();
  });
});

test.describe('«Hoy»', () => {
  test.use({ storageState: WEEK_ON });

  test('counts without asking for any deck, the same as the study screen', async ({ page }) => {
    const reads = deckReads(page);
    await signIn(page);
    await expect(load(page)).toBeVisible();
    const home = await homeLoad(page);
    expect(home).toMatch(/^4 para hoy · ~\d+ min \(4\+0\+0\)$/);
    await page.waitForTimeout(500);
    expect(reads).toEqual([]);

    await today(page).getByRole('link', { name: 'Estudiar' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
    expect(await studyLoad(page)).toBe(home);

    for (const rating of ['Bien', 'Otra vez']) {
      await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
      await page.getByRole('button', { name: new RegExp(`^${rating}`) }).click();
    }
    await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
    const study = await studyLoad(page);
    await page.goto('/home');
    await expect(load(page)).toBeVisible();
    expect(await homeLoad(page)).toBe(study);
  });

  test('a test half done shows in «Seguir» and takes to its cover', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('region', { name: 'Seguir' })).toHaveCount(0);
    await page.goto(`${TEST_URL}/pautas`);
    await page.getByRole('button', { name: 'Comenzar' }).click();
    await page
      .getByRole('list', { name: 'Alternativas' })
      .getByRole('button', { name: /Splicing alternativo/ })
      .click();
    await expect(page.getByText('Correcta', { exact: true })).toBeVisible();
    await page.goto('/home');
    const follow = page.getByRole('region', { name: 'Seguir' });
    const link = follow.getByRole('link', { name: /Preguntas de práctica/ });
    await expect(link).toContainText('1 de 3');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${TEST_URL}/pautas$`));
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
  });

  test('«Ver toda la carrera» goes to /courses', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Ver toda la carrera' }).click();
    await expect(page).toHaveURL(/\/courses$/);
    await expect(page.getByRole('heading', { level: 1, name: 'La carrera' })).toBeVisible();
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`nothing moves while it loads (${scheme})`, () => {
    test.use({ storageState: WEEK_ON, colorScheme: scheme });
    // The site is light unless asked: «Como el sistema» follows the device.
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('qv-theme', 'system'));
    });

    test('a student with progress, and the data late', async ({ page }) => {
      await signIn(page);
      await page.goto('/semesters/2/courses/biologia-celular/notes/11-traduccion');
      await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
      await page.goto(`${DECK_URL}/study`);
      await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
      await page.getByRole('button', { name: /^Bien/ }).click();
      await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();

      await watchShifts(page);
      await page.addInitScript(() => localStorage.setItem('qv-demo-heatmap', 'slow'));
      await page.goto('/home');
      await expect(load(page)).toBeVisible();
      await expect(page.getByRole('region', { name: 'Seguir' })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Días de estudio' }).locator('dd').first(),
      ).toHaveText(/\d+ respuestas?/, { timeout: 5000 });
      await page.waitForTimeout(500);
      expect(await shift(page)).toBeLessThan(0.02);
      await page.reload();
      await expect(load(page)).toBeVisible();
      await page.waitForTimeout(1800);
      expect(await shift(page)).toBeLessThan(0.02);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('nothing moves for a student who just arrived', () => {
  test.use({ storageState: ONLY_ACCEPTED });

  for (const scheme of ['light', 'dark'] as const) {
    test(`with the first steps (${scheme})`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('qv-theme', 'system'));
      await page.emulateMedia({ colorScheme: scheme });
      await watchShifts(page);
      await signIn(page);
      await expect(page.getByRole('region', { name: 'Primeros pasos' })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Días de estudio' }).locator('dd').first(),
      ).toBeVisible();
      await page.waitForTimeout(800);
      expect(await shift(page)).toBeLessThan(0.02);
    });
  }
});

test.describe('one-time tips', () => {
  test.use({ storageState: WEEK_ON });

  test('after reading a note to the end, the search; in its own room, and closed it does not come back', async ({
    page,
  }) => {
    const NOTE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
    await signIn(page);
    await page.goto(NOTE);
    await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
    const tip = page.getByText(/El buscador de arriba encuentra cualquier apunte/);
    await expect(tip).toHaveCount(0);
    const end = page.getByRole('button', { name: /Reportar un error en este apunte/ });
    const before = await end.boundingBox();
    const after = page.locator('footer').first();
    const footer = await after.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(tip).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await end.boundingBox()).toEqual(before);
    expect(await after.evaluate((e) => e.getBoundingClientRect().top + window.scrollY)).toBe(
      footer,
    );
    await page.getByRole('button', { name: 'Cerrar el consejo' }).click();
    await expect(tip).toHaveCount(0);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    await expect(tip).toHaveCount(0);
  });
});

test('the account button greets by the first name, the menu has the whole name, and the bar does not move with it', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  const account = page.getByRole('button', { name: /tu cuenta$/i });
  const place = (l: typeof account) =>
    l.evaluate((e) => {
      const b = e.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map(Math.round);
    });
  const search = page.getByRole('banner').getByRole('button', { name: /Buscar en la página/ });
  const bar = async () => [await place(search), await place(account)];
  const closed = await bar();
  await expect(account).toHaveAccessibleName('Hola, Estudiante, tu cuenta');
  if (!isMobile) {
    await expect(account).toHaveText('Hola, Estudiante');
    // A name that is long is cut, so that the bar is the same for anybody.
    expect(closed[1]![2]).toBeLessThanOrEqual(12 * 16 + 80);
  }
  await account.click();
  await expect(page.getByRole('menu').getByText('Estudiante de prueba')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await bar()).toEqual(closed);
});
