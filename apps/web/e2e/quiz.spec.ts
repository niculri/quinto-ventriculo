import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * A short round of the synthetic practice test (packages/importer/test/fixtures/quiz, imported by
 * packages/importer/scripts/e2e-quizzes.ts): «Pautas de prueba» has 3 questions (one with a figure beside
 * the alternatives, one of statements I–III with a table, one with a photo).
 */
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

const heading = (page: Page) => page.getByRole('heading', { level: 2 }).first();
const option = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'Alternativas' }).getByRole('button', { name });

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test('a round: right and wrong, «Saltar», continuing after reloading, «Volver» to the cover, the wrong ones again', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/semesters/2/courses/biologia-celular');
  await page.getByRole('link', { name: /Preguntas de práctica/ }).click();
  await expect(page).toHaveURL(new RegExp(`${TEST_URL}/pautas$`));
  // The name on the site, without the standalone page's kicker, heading or footer.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Preguntas de práctica' }),
  ).toBeVisible();
  await expect(page.getByText('Certamen de prueba')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Pautas de prueba/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await noSideScroll(page);
  await page.getByRole('button', { name: 'Comenzar' }).click();

  // 1: the statement and the question in order, the figure beside, right; «Siguiente» does not move.
  await expect(heading(page)).toHaveText('¿Qué explica el resultado?');
  await expect(page.getByText('Un gen se expresa en dos tejidos')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Gel de prueba' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Siguiente' });
  const before = await next.boundingBox();
  await option(page, /Splicing alternativo/).click();
  await expect(page.getByText('Correcta', { exact: true })).toBeVisible();
  await expect(page.getByText('Por qué cada alternativa')).toBeVisible();
  await expect(page.getByText('Idea clave de la primera.')).toBeVisible();
  // What a revision changed is not shown.
  await expect(page.getByText(/no se publica/)).toHaveCount(0);
  expect(await next.boundingBox()).toEqual(before);
  await noSideScroll(page);
  await next.click();

  // 2: statements as a list of their own, a table; skipped (answered wrong at the end).
  await expect(heading(page)).toHaveText('Respecto de TBP, es correcto:');
  const statements = page.getByRole('list', { name: 'Afirmaciones' }).getByRole('listitem');
  await expect(statements).toHaveText([
    'I.Se une a la caja TATA.',
    'II.Es parte de TFIID.',
    'III.Corta el RNA.',
  ]);
  await expect(page.getByRole('cell', { name: 'TATA' })).toBeVisible();

  // «Saltar»: to the end of the round, without counting it; the photo takes its place.
  const skip = page.getByRole('button', { name: 'Saltar' });
  await skip.click();

  // 3: a photo (signed URL), at the same place of the round.
  await expect(heading(page)).toHaveText('¿Qué muestra la foto?');
  await expect(page.getByLabel('Pregunta actual')).toHaveText('2 / 3');
  await expect(page.getByLabel('1 buenas y 0 malas')).toBeVisible();
  const nextBox = await next.boundingBox();
  const photo = page.getByRole('img', { name: 'Foto de prueba' });
  await expect
    .poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  await option(page, /Un ribosoma/).click();
  await expect(page.getByText(/^Incorrecta/)).toBeVisible();
  // Answered: «Saltar» goes, «Siguiente» stays where it was.
  await expect(skip).toBeHidden();
  expect(await next.boundingBox()).toEqual(nextBox);
  await next.click();

  // The skipped one, last; reloading continues on it.
  await expect(heading(page)).toHaveText('Respecto de TBP, es correcto:');
  await page.reload();
  await expect(heading(page)).toHaveText('Respecto de TBP, es correcto:');
  await expect(page.getByLabel('Pregunta actual')).toHaveText('3 / 3');
  await expect(page.getByLabel('1 buenas y 1 malas')).toBeVisible();
  // The last one left cannot be skipped (neither with its key).
  await expect(page.getByRole('button', { name: 'Saltar' })).toBeDisabled();
  await page.keyboard.press('s');
  await expect(heading(page)).toHaveText('Respecto de TBP, es correcto:');

  // «Volver», on top, keeps the round; «Continuar» goes back to it. No «Temas» nor the old «← Volver».
  await expect(page.getByRole('button', { name: /Temas|elegir los temas/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '← Volver' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver a Biología celular · Certamen 2' }).click();
  await expect(page.getByRole('region', { name: 'Ronda a medias' })).toContainText(
    'Vas en la pregunta 3 de 3 · 1 buena y 1 mala',
  );
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(heading(page)).toHaveText('Respecto de TBP, es correcto:');
  await option(page, /Sólo I$/).click();
  await expect(page.getByText('Incorrecta. La correcta es la B')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultado' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hay que repasar' })).toBeVisible();
  await expect(page.getByText('33%')).toBeVisible();
  await noSideScroll(page);

  // «Repetir solo las malas»: the two wrong ones, in the order they were asked; «S» skips there too.
  await page.getByRole('button', { name: 'Repetir solo las malas' }).click();
  await expect(heading(page)).toHaveText('¿Qué muestra la foto?');
  await expect(page.getByLabel('Pregunta actual')).toHaveText('1 / 2');
  await page.keyboard.press('s');
  await expect(heading(page)).toHaveText('Respecto de TBP, es correcto:');
  await expect(page.getByLabel('Pregunta actual')).toHaveText('1 / 2');
  await option(page, /Sólo I y II/).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(heading(page)).toHaveText('¿Qué muestra la foto?');
});

test('the other tab: its own cover, a short answer, and the tab remembered', async ({ page }) => {
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('tab', { name: /Preguntas nuevas/ }).click();
  await expect(page).toHaveURL(new RegExp(`${TEST_URL}/nuevas$`));
  await expect(page.getByText('Aviso de las nuevas.')).toBeVisible();
  await page.getByText('Materia nueva').click();
  await expect(page.getByText('Un tema')).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar' }).click();
  await expect(heading(page)).toHaveText('¿Qué hebra se copia?');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.getByText('La hebra molde')).toBeVisible();
  await page.getByRole('button', { name: '✓ La sabía' }).click();
  await expect(page.getByText('La sabías')).toBeVisible();
  // Without a tab in the URL, the one last opened.
  await page.goto(TEST_URL);
  await expect(page).toHaveURL(new RegExp(`${TEST_URL}/nuevas$`));
});

test('in the middle of a round, a link to the test opens its cover; a reload goes on with the question', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the menu is a drawer on the phone; the rule is the same');
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  const question = await heading(page).textContent();
  // A reload: the same question.
  await page.reload();
  await expect(heading(page)).toHaveText(question!);
  await expect(page.getByLabel('Pregunta actual')).toBeVisible();
  // To the course and back to the test from the menu: the cover, with the round to continue.
  await page.getByRole('button', { name: 'Volver a Biología celular · Certamen 2' }).click();
  await page
    .getByRole('navigation', { name: 'Ruta' })
    .getByRole('link', { name: 'Biología celular' })
    .click();
  await expect(page).toHaveURL(/\/courses\/biologia-celular$/);
  await page
    .getByRole('navigation', { name: 'Menú del sitio' })
    .getByRole('link', { name: 'Tests' })
    .click();
  await expect(page.getByRole('region', { name: 'Ronda a medias' })).toBeVisible();
  await expect(page.getByLabel('Pregunta actual')).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Ronda a medias' })
    .getByRole('button', { name: 'Continuar' })
    .click();
  await expect(heading(page)).toHaveText(question!);
});
