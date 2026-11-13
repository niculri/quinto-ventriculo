import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { DECK_URL, signIn } from './helpers';

/**
 * What a screen reader gets (step 3.5), from the accessibility tree: names, roles, where the focus goes and what is
 * announced, studying a card and answering a test. VoiceOver itself is checked by hand.
 */
const TEST_URL = '/semesters/2/courses/biologia-celular/tests/certamen-2/preguntas-de-practica';

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el
      ? `${el.getAttribute('role') ?? el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''}`
      : '';
  });

test('studying: the side on screen takes the focus, and each change is announced', async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await page.goto(`${DECK_URL}/study`);
  const status = page.locator('p[role="status"]');
  await expect(status).toHaveText('Tarjeta 1 de esta sesión');
  await expect.poll(() => focused(page)).toBe('region Frente de la tarjeta');
  await expect(page.getByRole('group', { name: 'Tarjetas que quedan' })).toBeVisible();

  // From the card, Tab reaches «Mostrar respuesta» (through what the card has, its hint). Safari's Tab skips buttons
  // unless its setting says otherwise: there, straight to it.
  if (browserName === 'webkit') {
    await page.getByRole('button', { name: 'Mostrar respuesta' }).focus();
  } else {
    let reached = false;
    for (let i = 0; i < 4 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = (await focused(page)).includes('Mostrar respuesta');
    }
    expect(reached).toBe(true);
  }
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Respuesta de la tarjeta 1 de esta sesión');
  await expect.poll(() => focused(page)).toBe('region Reverso de la tarjeta');

  // Each answer says its interval, not only its color.
  const answer = page.getByRole('group', { name: 'Responder' });
  await expect(answer).toMatchAriaSnapshot(`
    - group "Responder":
      - button /Otra vez \\(.+\\)/
      - button /Difícil \\(.+\\)/
      - button /Bien \\(.+\\)/
      - button /Fácil \\(.+\\)/
  `);
  await answer.getByRole('button', { name: /^Bien/ }).click();
  await expect(status).toHaveText('Tarjeta 2 de esta sesión');
  await expect.poll(() => focused(page)).toBe('region Frente de la tarjeta');

  // Undo: the card comes back, and it is announced (the polite toast and the status).
  await page.keyboard.press('ControlOrMeta+z');
  await expect(status).toHaveText('Tarjeta 3 de esta sesión');
  await expect(page.locator('[aria-live="polite"]').getByText(/^Deshecho/)).toBeVisible();
});

test('a test: the question takes the focus, the verdict is announced and the alternatives say which is right', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${TEST_URL}/pautas`);
  await page.getByRole('button', { name: 'Comenzar' }).click();
  const question = page.getByRole('region', { name: 'Pregunta' });
  const verdict = question.getByRole('status');
  await expect(verdict).toHaveText('');
  await expect.poll(() => focused(page)).not.toBe('body ');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.qcard'))).toBe(true);

  const options = question.getByRole('list', { name: 'Alternativas' }).getByRole('button');
  await options.first().click();
  await expect(verdict).toHaveText(/^(✓|✗)(Correcta|Incorrecta\. La correcta es la [A-E])$/);
  await expect.poll(() => focused(page)).toMatch(/Siguiente|Ver resultado/);
  // The right one and the chosen one are told in words, not only in color.
  await expect(
    question.getByRole('button', { name: /la correcta$|tu respuesta, correcta$/ }),
  ).toHaveCount(1);
  if ((await verdict.textContent())?.includes('Incorrecta')) {
    await expect(question.getByRole('button', { name: /tu respuesta, incorrecta$/ })).toHaveCount(
      1,
    );
  }

  // «Siguiente»: the next question takes the focus, and the verdict is empty again.
  await page.keyboard.press('Enter');
  await expect(verdict).toHaveText('');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.qcard'))).toBe(true);
});
