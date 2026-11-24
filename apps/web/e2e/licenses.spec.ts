// E2e tests of /licenses, which is public, and of the footer's links to it and to the source code (AGPL, section 13).
import { expect, test } from './test';
import { signIn } from './helpers';

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
    await expect(main.getByRole('link', { name: 'Review Heatmap' })).toHaveAttribute(
      'href',
      'https://github.com/glutanimate/review-heatmap',
    );
    await expect(main).toContainText('El material de estudio no es parte del código');
    const list = page.getByRole('list', { name: 'Paquetes de terceros' });
    await expect(list.getByRole('listitem').filter({ hasText: /^react \d/ })).toContainText('MIT');
    await expect(list.getByRole('listitem').filter({ hasText: /^hono \d/ })).toContainText(
      'servidor',
    );
    const text = await page.request.get('/third-party-licenses.txt');
    expect(text.ok()).toBe(true);
    const body = await text.text();
    expect(body).toMatch(/^El Quinto Ventrículo: licencias/);
    // QV Sans's license, which the page names, is in the file.
    await expect(main).toContainText('QV Sans');
    expect(body).toMatch(/QV Sans \(recorte de Source Sans 3[^]*Reserved Font Name 'Source'/);
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
