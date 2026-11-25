// E2e tests of the deck list: a switch per topic, «Estudiar» on something off turns it on and offers to undo it back on
// the list, each row says its reviews today and what is left to see, the new cards a day are the assessment's (said
// once, beside «Estudiar»), and nothing in a row moves when it turns on.
import { expect, test } from './test';
import { ONLY_ACCEPTED } from './accepted';
import { signIn } from './helpers';

test.use({ storageState: ONLY_ACCEPTED });

const ASSESSMENT_URL = '/semesters/1/courses/anatomia-1/anki/certamen-1';

test('«Estudiar» on a topic off turns it on and opens it; back on the list, «Deshacer»', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  const list = page.getByRole('list', { name: 'Submazos' });
  const topic = list.getByRole('switch', { name: 'Activar Mazo de prueba' });
  await expect(topic).not.toBeChecked();
  await expect(list.getByRole('listitem').last()).toContainText('Sin activar');
  await expect(list.getByRole('listitem').last()).toContainText(/^\D*\d+ sin ver(?! de)/);

  await list.getByRole('button', { name: 'Activar y estudiar Mazo de prueba' }).click();
  await page
    .getByRole('dialog', { name: 'Cómo se estudia aquí' })
    .getByRole('button', { name: 'Entendido' })
    .click();
  await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page
    .getByRole('group', { name: 'Responder' })
    .getByRole('button', { name: /^Bien/ })
    .click();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${ASSESSMENT_URL}$`));
  const notice = page.getByRole('status').filter({ hasText: 'Se activó «Mazo de prueba»' });
  await expect(notice).toBeVisible();
  await expect(topic).toBeChecked();
  await expect(list.getByRole('listitem').last()).toContainText(/\d+ sin ver de \d+/);
  // One card seen and remembered is «100 %» of dominio, on one line.
  const meter = page.locator('[data-mastery]').first();
  await expect(meter).toContainText('100 %');
  expect((await meter.boundingBox())!.height).toBeLessThanOrEqual(20);

  await notice.getByRole('button', { name: 'Deshacer' }).click();
  await expect(notice).toHaveCount(0);
  await expect(topic).not.toBeChecked();
  // What was seen stays seen, even turned off.
  await expect(list.getByRole('listitem').last()).toContainText(/\d+ sin ver de \d+/);
});

test('turning a topic on moves nothing in its row nor the rows below', async ({ page }) => {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  const list = page.getByRole('list', { name: 'Submazos' });
  const rows = list.getByRole('listitem');
  const topic = list.getByRole('switch', { name: 'Activar Mazo de prueba' });
  await expect(rows.last()).toContainText('Sin activar');
  // On the page, not on the screen: a click can scroll a phone's screen.
  const boxes = async () =>
    Promise.all(
      [rows.first(), rows.last(), topic].map((l) =>
        l.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return { y: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
        }),
      ),
    );
  const before = await boxes();
  await topic.click();
  await expect(rows.last()).toContainText('Hoy: solo nuevas');
  const after = await boxes();
  for (const [i, b] of before.entries()) {
    expect([i, after[i]!.y, after[i]!.height]).toEqual([i, b.y, b.height]);
  }
  await expect(rows.first().getByRole('switch')).toBeChecked();
});

test('the new cards a day are the assessment’s: said beside its number and once, beside «Estudiar»', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  await expect(
    page.getByText(/^Es un solo número para todo Certamen 1, no uno por tema: /),
  ).toBeVisible();
  const list = page.getByRole('list', { name: 'Submazos' });
  await list.getByRole('switch', { name: 'Activar Mazo de prueba' }).click();
  await expect(page.getByRole('group', { name: 'Para hoy' }).getByRole('button')).toHaveText(
    /^\d+ nuevas · ~\d+ min$/,
  );
  await expect(list.getByRole('listitem').last()).toContainText('Hoy: solo nuevas');
});
