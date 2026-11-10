import { readFile } from 'node:fs/promises';
import { expect, test } from './test';
import type { Page } from '@playwright/test';
import { LEGAL_VERSIONS } from '@qv/schema';
import { signIn } from './helpers';

/** Step 2.3: /privacy and /terms without a session, the popup on entering, downloading the data and deleting. */

const fitsTheWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('without a session', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the landing page links the terms and the privacy policy, which open without a session', async ({
    page,
  }) => {
    await page.goto('/');
    const legal = page.getByRole('navigation', { name: 'Textos legales' });
    await legal.getByRole('link', { name: 'Privacidad' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Política de privacidad' }),
    ).toBeVisible();
    await expect(page.getByText(`Versión ${LEGAL_VERSIONS.privacy.version} ·`)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '9. Cuánto tiempo los guardamos' }),
    ).toBeVisible();
    expect(await fitsTheWidth(page)).toBe(true);

    await page
      .getByRole('navigation', { name: 'Textos legales' })
      .getByRole('link', { name: 'Términos de uso' })
      .click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Términos de uso' })).toBeVisible();
    await expect(page.getByRole('main').getByText(/sin relación oficial/)).toBeVisible();
    expect(await fitsTheWidth(page)).toBe(true);
    // Nothing of the material, and no request for it.
    const asked: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) asked.push(r.url());
    });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Términos de uso' })).toBeVisible();
    expect(asked).toEqual([]);
  });
});

test.describe('the first time', () => {
  // A student who never accepted (nothing in this browser).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the popup comes once, nothing of the material is behind it, and «Acepto» lets in', async ({
    page,
  }) => {
    const material: string[] = [];
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (path.startsWith('/api/') && path !== '/api/health') material.push(path);
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Antes de entrar' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toHaveCount(0);
    expect(material).toEqual([]);
    // It is answered, not closed.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    // The texts open in another tab, and the popup stays.
    const [terms] = await Promise.all([
      page.context().waitForEvent('page'),
      dialog.getByRole('link', { name: 'Términos de uso' }).click(),
    ]);
    await expect(terms.getByRole('heading', { level: 1, name: 'Términos de uso' })).toBeVisible();
    await terms.close();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Acepto' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    // Once: reloading does not ask again.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('«Descargar mis datos» saves a JSON file with the account', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings/account');
  await expect(page.getByText(/^Aceptaste los términos de uso/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar mis datos' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^el-quinto-ventriculo-mis-datos-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const data = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    site: string;
    account: { email: string };
  };
  expect(data).toMatchObject({
    site: 'El Quinto Ventrículo',
    account: { email: 'demo@ug.uchile.cl' },
  });
});

test('«Eliminar mi cuenta»: the email, until when, out; entering again cancels it and says so', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar mi cuenta' });
  const confirm = dialog.getByRole('button', { name: 'Eliminar mi cuenta' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Para confirmar, escribe tu correo/).fill('demo@ug.uchile.cl');
  await confirm.click();
  const done = page.getByRole('dialog', { name: 'Pediste eliminar tu cuenta' });
  await expect(done).toContainText(/Tu cuenta se borrará el \d+ de \w+ de \d{4} a las \d{2}:\d{2}/);
  await done.getByRole('button', { name: 'Entendido' }).click();
  await expect(page).toHaveURL(/\/\?notice=deletion$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'Tu cuenta se eliminará' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  const cancelled = page.getByRole('dialog', { name: 'Se canceló la eliminación de tu cuenta' });
  await expect(cancelled).toBeVisible();
  await cancelled.getByRole('button', { name: 'Entendido' }).click();
  await expect(cancelled).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
