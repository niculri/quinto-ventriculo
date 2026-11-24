// E2e tests of signing in with Google's own button (the demo's stand-in, which hands back a test ID token with the
// nonce): it enters, the redirect takes its place when Google's script is blocked, and nothing moves between the two.
import { expect, test } from './test';
import type { Page } from '@playwright/test';

const google = (page: Page) => page.locator('[data-google="demo"]');
const otherWay = (page: Page) => page.getByText('¿No se abre la ventana de Google?');

/** Where the line under the buttons and the next section are, which a different button would push. */
async function layout(page: Page) {
  const only = await page.getByText('Solo con tu cuenta @ug.uchile.cl').boundingBox();
  const next = await page.getByRole('heading', { level: 2, name: 'Qué hay adentro' }).boundingBox();
  return { only, next };
}

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Google’s button in both places enters with its token, with nothing asked of Google', async ({
    page,
  }) => {
    const outside: string[] = [];
    page.on('request', (r) => {
      const { hostname } = new URL(r.url());
      if (hostname !== 'localhost') outside.push(hostname);
    });
    await page.goto('/?next=%2Fsemesters%2F1');
    await expect(google(page)).toHaveCount(2);
    await expect(otherWay(page)).toBeVisible();
    await google(page).filter({ hasText: 'Entrar con Google' }).click();
    // The terms in force are not accepted in this browser: the popup comes, as with the redirect.
    const dialog = page.getByRole('dialog', { name: 'Antes de entrar' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Acepto' }).click();
    await expect(page).toHaveURL(/\/semesters\/1$/);
    expect(outside).toEqual([]);
  });

  test('with Google’s script blocked, ours is the button, goes by redirect, and nothing moved', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(google(page)).toHaveCount(2);
    const ready = await layout(page);

    await page.evaluate(() => localStorage.setItem('qv-demo-google', 'blocked'));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeEnabled();
    await expect(google(page)).toHaveCount(0);
    await expect(otherWay(page)).toBeHidden();
    expect(await layout(page)).toEqual(ready);

    await page.getByRole('button', { name: 'Entrar con Google' }).click();
    await expect(page.getByRole('dialog', { name: 'Antes de entrar' })).toBeVisible();
  });
});
