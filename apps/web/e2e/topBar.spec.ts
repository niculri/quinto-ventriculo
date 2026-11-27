// E2e test of the site's bar at every width: the site's name on one line from 768 px (below, it may wrap) and the
// search box's text never cut.
import { expect, test } from './test';
import { signIn } from './helpers';

for (const width of [360, 390, 640, 768, 832, 900, 1024, 1280]) {
  test(`at ${width} px «Buscar…» is whole, and the name one line from 768 px`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the widths are set here');
    await page.setViewportSize({ width, height: 800 });
    await signIn(page);
    const bar = page.getByRole('banner');
    const search = bar.getByRole('button', { name: 'Buscar en la página' });
    await expect(search).toBeVisible();
    const cut = await search.evaluate((button) =>
      [...button.querySelectorAll('span span')]
        .filter((e) => e.getClientRects().length)
        .map(
          (e) =>
            e.scrollWidth > e.clientWidth + 1 ||
            e.parentElement!.scrollWidth > e.parentElement!.clientWidth + 1,
        ),
    );
    expect(cut).toEqual([false]);
    const name = bar.getByText('El Quinto Ventrículo', { exact: true });
    if (width >= 768) {
      expect(await name.evaluate((e) => e.getClientRects().length)).toBe(1);
      expect((await name.boundingBox())!.height).toBeLessThan(22);
    }
  });
}
