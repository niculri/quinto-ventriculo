import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 1.8: the notes of an assessment grouped by week (Anatomía II's Certamen 2 will have 29 articles in 5 weeks), a
 * note that changes assessment (the Seminario 8 of Biocel, from the Certamen 2 to the 3) whose link keeps working, and
 * the administrator's switch that hides the semesters without material. Nothing moves while loading or between pages.
 */

interface NoteShape {
  id: string;
  slug: string;
  assessmentId: string;
  position: number;
  group?: string;
  [key: string]: unknown;
}
interface CatalogShape {
  semesters: {
    number: number;
    courses: {
      id: string;
      assessments: { id: string; name: string; position: number; notes: NoteShape[] }[];
    }[];
  }[];
}

/** Changes the catalog the API gives (as a later import would). */
async function withCatalog(page: Page, change: (c: CatalogShape) => void) {
  await page.route('**/api/catalog', async (route) => {
    const response = await route.fetch();
    const catalog = (await response.json()) as CatalogShape;
    change(catalog);
    await route.fulfill({ response, json: catalog });
  });
}

const WEEKS = [
  'S4 - Anatomía de la visión y audición',
  'S5 - SMAS y cavidad nasal',
  'S6 - ATM y cavidad oral',
  'S7 - Topografía cervical y músculos del cuello',
  'S8 - Espacios craneovertebral y visceral del cuello',
];
const PER_WEEK = [7, 6, 6, 6, 4];
const NOTES_URL = '/semesters/1/courses/anatomia-1/assessments/certamen-1/notes';

/** 29 articles in 5 weeks, in the e2e content's Anatomía I · Certamen 1. */
function twentyNine(c: CatalogShape) {
  const a = c.semesters
    .flatMap((s) => s.courses)
    .flatMap((x) => x.assessments)
    .find((x) => x.id === 'anatomia-1/certamen-1')!;
  const notes: NoteShape[] = [];
  WEEKS.forEach((group, w) => {
    for (let i = 1; i <= PER_WEEK[w]!; i++) {
      const n = notes.length + 1;
      notes.push({
        id: `AP-A2-S${w + 4}-0${i}`,
        slug: `s${w + 4}-tema-${i}`,
        courseId: 'anatomia-1',
        assessmentId: a.id,
        kind: 'lecture',
        title: `Tema ${n} de la semana ${w + 4}`,
        position: n,
        updatedAt: '2026-11-07T12:00:00.000Z',
        group,
      });
    }
  });
  a.notes = notes;
}

/** Where the breadcrumbs and the title are, and how wide the page is. */
async function frame(page: Page, isMobile: boolean) {
  const main = page.getByRole('main');
  const crumbs = main.getByRole('navigation', { name: 'Ruta' });
  await expect(crumbs.getByRole('listitem').first()).toHaveText('Inicio');
  const a = (await crumbs.boundingBox())!;
  const b = (await main.getByRole('heading', { level: 1 }).boundingBox())!;
  const width = await main.evaluate((m) => m.getBoundingClientRect().width);
  return (isMobile ? [a.x, a.y, width] : [a.x, a.y, b.x, b.y, width]).map(Math.round);
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('29 articles in 5 weeks: one block per week, in order, and the frame does not move', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await withCatalog(page, twentyNine);
  await page.goto('/semesters/1/courses/anatomia-1');
  const course = await frame(page, isMobile);

  await page.goto(NOTES_URL);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Apuntes' })).toBeVisible();
  expect(await frame(page, isMobile)).toEqual(course);
  // A week per block, in order, each with its notes; nothing left by kind.
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(WEEKS);
  const lists = main
    .getByRole('list')
    .filter({ has: page.getByRole('link', { name: /^Tema \d+ de la semana/ }) });
  await expect(lists).toHaveCount(WEEKS.length);
  for (let w = 0; w < WEEKS.length; w++) {
    await expect(lists.nth(w).getByRole('listitem')).toHaveCount(PER_WEEK[w]!);
  }
  await expect(main.getByRole('link', { name: /^Tema \d+ de la semana/ })).toHaveCount(29);
  await expect(main.getByRole('heading', { level: 2, name: 'Clases' })).toHaveCount(0);
  // Nothing jumps in after it appears.
  const title = main.getByRole('heading', { level: 1 });
  const first = await title.boundingBox();
  await page.waitForTimeout(600);
  expect(await title.boundingBox()).toEqual(first);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);

  if (!isMobile) {
    // The menu: «Apuntes» with the weeks' names (not links) above their notes.
    const menu = page.getByRole('navigation', { name: 'Menú del sitio' });
    await expect(menu.getByRole('button', { name: 'Apuntes' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    for (const week of WEEKS) await expect(menu.getByText(week, { exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: /^Tema \d+ de la semana/ })).toHaveCount(29);
    await expect(menu.getByRole('link', { name: WEEKS[0]! })).toHaveCount(0);
  }
});

test('a note that changes assessment: its link opens it in the new one, and the old forms still work', async ({
  page,
}) => {
  const ARTICLE = '/semesters/2/courses/biologia-celular/notes/10-nucleo-celular';
  await signIn(page);
  // The e2e content's «Núcleo celular» goes to a Certamen 3, as the Seminario 8 of Biocel did.
  await withCatalog(page, (c) => {
    const course = c.semesters.flatMap((s) => s.courses).find((x) => x.id === 'biologia-celular')!;
    const c2 = course.assessments.find((a) => a.id === 'biologia-celular/certamen-2')!;
    const moved = c2.notes.find((n) => n.slug === '10-nucleo-celular')!;
    c2.notes = c2.notes.filter((n) => n !== moved);
    course.assessments.push({
      ...c2,
      id: 'biologia-celular/certamen-3',
      name: 'Certamen 3',
      position: 3,
      notes: [{ ...moved, assessmentId: 'biologia-celular/certamen-3', position: 1 }],
      quizzes: [],
      cardCount: 0,
    } as (typeof course.assessments)[number]);
  });
  await page.goto(ARTICLE);
  const crumbs = page.getByRole('main').getByRole('navigation', { name: 'Ruta' });
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await expect(crumbs).toContainText('Certamen 3');
  await expect(crumbs).not.toContainText('Certamen 2');
  // The oldest form of the link (/notes/<slug>) lands on the same page.
  await page.goto('/notes/10-nucleo-celular');
  await expect(page).toHaveURL(new RegExp(`${ARTICLE}$`));
  await expect(crumbs).toContainText('Certamen 3');
  // Listed in the new assessment, not in the old one.
  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-3/notes');
  await expect(page.getByRole('main').getByRole('link', { name: /Núcleo/ })).toHaveCount(1);
  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes');
  await expect(page.getByRole('main').getByRole('link', { name: /Núcleo/ })).toHaveCount(0);
});

test.describe('the semesters without material', () => {
  // One switch for the whole demo server: only one project changes it, and it is turned off at the end.
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'the switch is the same for the whole demo server');

  test.afterEach(async ({ page }) => {
    await page.request.put('/api/admin/site-settings', {
      headers: { Authorization: 'Bearer demo-local' },
      data: { hideEmptySemesters: false },
    });
  });

  test('the switch hides them: the line in their place, nothing moves, and their URL does not exist', async ({
    page,
  }) => {
    await signIn(page);
    const main = page.getByRole('main');
    const third = main.getByText('3° Semestre', { exact: true });
    await expect(third).toBeVisible();
    const home = await frame(page, false);
    const degree = (await main.getByRole('heading', { name: 'La carrera' }).boundingBox())!;

    await page.goto('/admin/site');
    const toggle = page.getByRole('switch', { name: 'Ocultar los semestres sin contenido' });
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
    const box = await toggle.boundingBox();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(page.getByText(/^Cambiado el .* por demo@ug\.uchile\.cl$/)).toBeVisible();
    expect(await toggle.boundingBox()).toEqual(box);

    // At once in this tab: through the menu, without reloading.
    await page
      .getByRole('navigation', { name: 'Menú del sitio' })
      .getByRole('link', { name: 'Inicio' })
      .click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(main.getByText('Los próximos semestres vienen pronto.')).toBeVisible();
    await expect(third).toHaveCount(0);
    expect(await frame(page, false)).toEqual(home);
    expect((await main.getByRole('heading', { name: 'La carrera' }).boundingBox())!.y).toBe(
      degree.y,
    );
    await expect(main.getByRole('link', { name: /2° Semestre/ })).toBeVisible();

    // A hidden semester does not open by its URL.
    await page.goto('/semesters/3');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Esta página no aparece ni en el Netter' }),
    ).toBeVisible();

    // Off again: back as it was.
    await page.goto('/admin/site');
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.goto('/home');
    await expect(third).toBeVisible();
    await expect(main.getByText('Los próximos semestres vienen pronto.')).toHaveCount(0);
  });
});
