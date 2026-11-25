// E2e tests of the deck list: a switch per topic, «Estudiar» on something off turns it on and offers to undo it back on
// the list, each row says what it has today and the cards seen, and nothing in a row moves when it turns on.
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
  await expect(list.getByRole('listitem').last()).toContainText(/\d+ tarjetas/);

  await list.getByRole('button', { name: 'Activar y estudiar Mazo de prueba' }).click();
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
  await expect(list.getByRole('listitem').last()).toContainText(/Vistas 1 de \d+/);

  await notice.getByRole('button', { name: 'Deshacer' }).click();
  await expect(notice).toHaveCount(0);
  await expect(topic).not.toBeChecked();
  // What was seen stays seen, even turned off.
  await expect(list.getByRole('listitem').last()).toContainText(/Vistas 1 de \d+/);
});

test('turning a topic on moves nothing in its row nor the rows below', async ({ page }) => {
  await signIn(page);
  await page.goto(ASSESSMENT_URL);
  const list = page.getByRole('list', { name: 'Submazos' });
  const rows = list.getByRole('listitem');
  const topic = list.getByRole('switch', { name: 'Activar Mazo de prueba' });
  await expect(rows.last()).toContainText('Sin activar');
  const boxes = async () =>
    Promise.all([rows.first(), rows.last(), topic].map(async (l) => (await l.boundingBox())!));
  const before = await boxes();
  await topic.click();
  await expect(rows.last()).toContainText(/Hoy: \d+ nuevas/);
  const after = await boxes();
  for (const [i, b] of before.entries()) {
    expect([i, after[i]!.y, after[i]!.height]).toEqual([i, b.y, b.height]);
  }
  await expect(rows.first().getByRole('switch')).toBeChecked();
});
