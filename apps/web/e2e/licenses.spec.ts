import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 2.4: /licenses is public (like /terms and /privacy) and the site offers its source code (AGPL, section 13): the
 * footer links to both, with and without a session, and the third-party licenses come from node_modules.
 */

const SOURCE = 'https://github.com/niculri/quinto-ventriculo';

test.describe('without a session', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/licenses: the code’s license and source, Anki and FSRS, the material apart and the packages', async ({
    page,
  }) => {
    await page.goto('/licenses');
    await expect(page.getByRole('heading', { level: 1, name: 'Licencias' })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main).toContainText('AGPL-3.0-or-later');
    await expect(
      main.getByRole('link', { name: 'github.com/niculri/quinto-ventriculo' }),
    ).toHaveAttribute('href', SOURCE);
    await expect(main).toContainText('Ankitects Pty Ltd');
    await expect(main).toContainText('El material de estudio no es parte del código');
    const list = page.getByRole('list', { name: 'Paquetes de terceros' });
    await expect(list.getByRole('listitem').filter({ hasText: /^react \d/ })).toContainText('MIT');
    await expect(list.getByRole('listitem').filter({ hasText: /^hono \d/ })).toContainText(
      'servidor',
    );
    const text = await page.request.get('/third-party-licenses.txt');
    expect(text.ok()).toBe(true);
    expect(await text.text()).toMatch(/^El Quinto Ventrículo: licencias/);
  });

  test('the landing page links to the licenses and the source code', async ({ page }) => {
    await page.goto('/');
    const legal = page.getByRole('navigation', { name: 'Textos legales' });
    await expect(legal.getByRole('link', { name: 'Licencias' })).toHaveAttribute(
      'href',
      '/licenses',
    );
    await expect(legal.getByRole('link', { name: 'Código fuente' })).toHaveAttribute(
      'href',
      SOURCE,
    );
  });
});

test('with a session, the footer links to the licenses and the source code', async ({ page }) => {
  await signIn(page);
  const legal = page.getByRole('navigation', { name: 'Textos legales' });
  await expect(legal.getByRole('link', { name: 'Licencias' })).toHaveAttribute('href', '/licenses');
  await expect(legal.getByRole('link', { name: 'Código fuente' })).toHaveAttribute('href', SOURCE);
});
