// E2e tests of a lecture as an article: the header with its year and code, «Datos clave», the TOC that follows the
// reading, «Ponte a prueba» opening the test in its topics, the site's menu and the frame that does not move.
import { expect, test } from './test';
import { signIn } from './helpers';

const ARTICLE = '/semesters/2/courses/biologia-celular/notes/11-traduccion';

test('an article: header, key facts, the TOC to «Ponte a prueba» and the test in its topics', async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes');
  const row = page.getByRole('main').getByRole('link', { name: /Clase 11.*Traducción/ });
  await expect(row).toContainText('Prof. de prueba · 2026');
  await expect(row).toContainText('Actualizado el 2 de noviembre de 2026');
  await page.goto(ARTICLE);
  await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeVisible();
  const header = page.locator('article header');
  await expect(header).toContainText(
    'Clase 11·Prof. de prueba·Semestre de primavera 2026·ICBM, Universidad de Chile',
  );
  await expect(header.getByText('QV-BC-C2-11.2')).toBeHidden();
  await header.getByText('Código, fechas y fuentes').click();
  await expect(header.getByText('QV-BC-C2-11.2')).toBeVisible();
  await expect(header.getByText('Creado el 1 de noviembre de 2026')).toBeVisible();
  await expect(header.getByText('Actualizado el 2 de noviembre de 2026')).toBeVisible();
  await expect(header.getByText(/Clase 11 de prueba, semestre de primavera 2026/)).toBeVisible();
  await expect(page.locator('.callout-datos')).toContainText('Datos clave');
  await expect(page.locator('.callout-clinica .callout-label')).toHaveText('Relevancia clínica');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  if (isMobile) {
    const bar = page.getByRole('button', { name: 'Índice', exact: true });
    await expect(bar).toHaveAttribute('aria-expanded', 'false');
    await bar.click();
    const panel = page.locator('#toc-panel');
    await panel.getByRole('link', { name: 'Ponte a prueba' }).click();
    await expect(panel).toHaveCount(0);
  } else {
    const toc = page.getByRole('navigation', { name: 'Índice del artículo' });
    await toc.getByRole('link', { name: 'Ponte a prueba' }).click();
    await expect(toc.getByRole('link', { name: 'Ponte a prueba' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  }
  await expect(page).toHaveURL(/#ponte-a-prueba$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Ponte a prueba' })).toBeInViewport();
  const summary = page.locator('.note-summary');
  await expect(summary.getByRole('heading', { level: 2, name: 'Resumen' })).toBeAttached();

  if (isMobile) await page.getByRole('button', { name: 'Índice', exact: true }).click();
  const tocNav = isMobile
    ? page.locator('#toc-panel')
    : page.getByRole('navigation', { name: 'Índice del artículo' });
  await tocNav.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Traducción' })).toBeInViewport();
  await expect(page).toHaveURL(/11-traduccion$/);
  if (isMobile) await expect(page.locator('#toc-panel')).toHaveCount(0);
  await page.getByRole('heading', { level: 2, name: 'Ponte a prueba' }).scrollIntoViewIfNeeded();

  const card = page.getByRole('link', { name: /Preguntas de práctica.*Tema: Núcleo/s });
  await card.click();
  await expect(page).toHaveURL(/\/tests\/certamen-2\/preguntas-de-practica\/pautas$/);
  await expect(page.getByRole('switch', { name: /Núcleo/ })).toBeChecked();
  await expect(page.getByRole('switch', { name: /Transcripción/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible();
});

test('on the phone the TOC bar shows the section being read and closes outside', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone only');
  await signIn(page);
  await page.goto(`${ARTICLE}#elongacion`);
  const bar = page.getByRole('button', { name: 'Índice', exact: true });
  await expect(bar).toContainText('2. Elongación');
  await bar.click();
  await expect(page.locator('#toc-panel')).toBeVisible();
  await page.getByRole('heading', { level: 1, name: 'Traducción' }).click({ force: true });
  await expect(page.locator('#toc-panel')).toHaveCount(0);
});

test('the site menu: the way to the note, the other parts of its assessment, and none while answering', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'on the phone the menu is a drawer (the same tree)');
  await signIn(page);
  await page.goto(ARTICLE);
  const menu = page.getByRole('navigation', { name: 'Menú del sitio' });
  await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await expect(menu.getByRole('link', { name: '2° Semestre' })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Biología celular/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Apuntes' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(menu.getByRole('link', { name: 'Traducción' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await menu.getByRole('link', { name: 'Tests' }).click();
  await expect(page).toHaveURL(/\/tests\/certamen-2\/preguntas-de-practica/);
  await expect(menu).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar' }).click();
  await expect(page.getByLabel('Pregunta actual')).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver a Biología celular · Certamen 2' }).click();
  await expect(menu).toBeVisible();
});

test('nothing moves between pages: the breadcrumbs (from «Inicio») and the title at the same place', async ({
  page,
}) => {
  await signIn(page);
  const where = async () => {
    const main = page.getByRole('main');
    const crumbs = main.getByRole('navigation', { name: 'Ruta' });
    // The page itself, not its loading state (an article waits for its fonts), which has its breadcrumbs too.
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(crumbs.getByRole('listitem').first()).toHaveText('Inicio');
    const a = (await crumbs.boundingBox())!;
    const b = (await main.getByRole('heading', { level: 1 }).boundingBox())!;
    const width = await main.evaluate((m) => m.getBoundingClientRect().width);
    // The breadcrumbs are one line on every screen, however long (a phone cuts their middle): the title never goes down.
    expect(a.height).toBeLessThan(24);
    return [a.x, a.y, b.x, b.y, width].map(Math.round);
  };
  await page.goto('/semesters/2/courses/biologia-celular');
  const course = await where();
  await page.goto(ARTICLE);
  expect(await where()).toEqual(course);
  await page.goto(
    '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica/nuevas',
  );
  expect(await where()).toEqual(course);
  await page.goto('/semesters/1/courses/anatomia-1/anki/certamen-1');
  expect(await where()).toEqual(course);
  await page.goto('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes');
  expect(await where()).toEqual(course);
  await page.goto('/semesters/1/courses/anatomia-1/anki/cards');
  expect(await where()).toEqual(course);
  await page.goto('/home');
  expect(await where()).toEqual(course);
});
