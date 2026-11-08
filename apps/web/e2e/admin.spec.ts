import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Step 2.10: «Administración», its own page by sections, from the account menu. A student does not see it nor open it
 * (the API's side is apps/api/src/*.test.ts); nothing moves when entering, changing section or loading; «Acceso»
 * invites and removes with popups of its own; «Fuera del sitio» only shows the record (e2e/content/release/
 * unpublish-log.json). The demo's user is an administrator; `qv-demo-role` = `student` makes it a student.
 */

const SECTIONS = [
  ['Publicaciones', '/admin/releases', 'Publicaciones'],
  ['Reportes', '/admin/reports', 'Reportes'],
  ['Acceso', '/admin/access', 'Acceso'],
  ['Sitio', '/admin/site', 'Sitio'],
  ['Fuera del sitio', '/admin/unpublished', 'Fuera del sitio'],
] as const;

/**
 * Where each element is (page coordinates), at every frame while `act` runs and a little after: one box each if
 * nothing moved ('none' while it is not there).
 */
async function boxesWhile(
  page: Page,
  selectors: string[],
  act: () => Promise<void>,
  /** Only where it starts (a title whose text changes changes its width). */
  onlyPlace = false,
) {
  await page.evaluate(
    ({ sels, onlyPlace }) => {
      const w = window as unknown as { boxes_: Record<string, string[]> };
      w.boxes_ = Object.fromEntries(sels.map((s) => [s, []]));
      let n = 0;
      const take = () => {
        for (const s of sels) {
          const e = document.querySelector(s);
          const b = e?.getBoundingClientRect();
          const where = b
            ? (onlyPlace
                ? [b.x, b.y + window.scrollY]
                : [b.x, b.y + window.scrollY, b.width, b.height]
              )
                .map(Math.round)
                .join(',')
            : 'none';
          if (!w.boxes_[s]!.includes(where)) w.boxes_[s]!.push(where);
        }
        if (++n < 120) requestAnimationFrame(take);
      };
      requestAnimationFrame(take);
    },
    { sels: selectors, onlyPlace },
  );
  await act();
  await page.waitForTimeout(1500);
  return page.evaluate(() => (window as unknown as { boxes_: Record<string, string[]> }).boxes_);
}

/** The menu that has the sections: the site's on wide screens, the page's (tabs) on the phone. */
async function sectionsMenu(page: Page) {
  const own = page.getByRole('navigation', { name: 'Secciones de la administración' });
  return (await own.isVisible()) ? own : page.getByRole('navigation', { name: 'Menú del sitio' });
}

test('a student does not see «Administración» nor opens any of its pages', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('qv-demo-role', 'student'));
  await signIn(page);
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await expect(page.getByRole('menuitem', { name: /Opciones/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Administración/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (const url of ['/admin', '/admin/access', '/admin/unpublished', '/settings/admin']) {
    await page.goto(url);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Esta página no aparece ni en el Netter' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administración' })).toHaveCount(0);
  }
});

test('from the account menu to «Administración»; changing section moves nothing at any frame', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: /Administración/ }).click();
  await expect(page).toHaveURL(/\/admin\/releases$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Administración' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Publicaciones' })).toBeVisible();
  // «Opciones» no longer has it.
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Opciones' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Publicaciones' })).toHaveCount(0);
  // The old URL goes to its section.
  await page.goto('/settings/admin/releases');
  await expect(page).toHaveURL(/\/admin\/releases$/);
  await expect(page.getByRole('heading', { name: 'Lista de revisión' })).toBeVisible();

  const menu = await sectionsMenu(page);
  const FIXED = ['nav[aria-label="Ruta"]', 'main h1', 'main h2'];
  for (const [label, url, title] of [...SECTIONS.slice(1), SECTIONS[0]]) {
    const boxes = await boxesWhile(
      page,
      FIXED,
      async () => {
        await menu.getByRole('link', { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${url}$`));
        await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
      },
      true,
    );
    for (const s of FIXED) expect(boxes[s], `${label}: ${s}`).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  }
});

/**
 * Revisión de cero (2.10): entering and loading, not only changing section. Every section opened by its URL (a page
 * loaded from nothing): from the first frame on, the route, the title and the section's title take one place each
 * once they are there, and the route and the title are where «Opciones» has them (the same frame as every page).
 */
test('entering and loading «Administración»: the frame of «Opciones», and nothing moves from the first frame', async ({
  page,
  isMobile,
}) => {
  const PLACES = ['main nav[aria-label="Ruta"]', 'main h1', 'main h2'];
  await page.addInitScript((sels) => {
    const w = window as unknown as { places_: Record<string, string[]> };
    w.places_ = Object.fromEntries(sels.map((s) => [s, []]));
    let n = 0;
    const take = () => {
      for (const s of sels) {
        const b = document.querySelector(s)?.getBoundingClientRect();
        if (!b) continue;
        const where = [b.x, b.y + window.scrollY].map(Math.round).join(',');
        if (!w.places_[s]!.includes(where)) w.places_[s]!.push(where);
      }
      if (++n < 600) requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, PLACES);
  const frameOf = async () => {
    const main = page.getByRole('main');
    const a = (await main.getByRole('navigation', { name: 'Ruta' }).boundingBox())!;
    const b = (await main.getByRole('heading', { level: 1 }).boundingBox())!;
    const width = await main.evaluate((m) => m.getBoundingClientRect().width);
    return (isMobile ? [a.x, a.y, width] : [a.x, a.y, b.x, b.y, width]).map(Math.round);
  };
  await signIn(page);
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Opciones' })).toBeVisible();
  const options = await frameOf();
  for (const [, url, title] of SECTIONS) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await page.waitForTimeout(1000);
    const places = await page.evaluate(
      () => (window as unknown as { places_: Record<string, string[]> }).places_,
    );
    for (const s of PLACES) expect(places[s], `${url}: ${s}`).toHaveLength(1);
    expect(await frameOf(), url).toEqual(options);
  }
});

test('«Acceso»: invite into a new list, see what it did, and remove a person writing their email', async ({
  page,
}) => {
  // Never the browser's confirm or prompt.
  const browserDialogs: string[] = [];
  page.on('dialog', (d) => {
    browserDialogs.push(d.type());
    void d.dismiss();
  });
  await signIn(page);
  await page.goto('/admin/access');
  await expect(page.getByText(/Solo las cuentas invitadas: 3 en 2 listas/)).toBeVisible();
  const button = page.getByRole('button', { name: 'Invitar', exact: true });
  const boxes = await boxesWhile(page, ['form button[type="submit"]', 'main h3'], async () => {
    // As Gmail copies them (Revisión de cero, 2.10, con el dueño): only the emails between < > are sent.
    await page
      .getByLabel('Correos @ug.uchile.cl')
      .fill(
        'Rosa Díaz <Rosa.Diaz@ug.uchile.cl>, ana.perez@ug.uchile.cl\nAlguien <alguien@gmail.com>',
      );
    await expect(page.getByText('3 correos (3 palabras no son correos)')).toBeVisible();
    await page.getByLabel('Nombre de la lista nueva').fill('Medicina 2027');
  });
  expect(boxes['form button[type="submit"]']).toHaveLength(1);
  await button.click();
  const result = page.getByRole('dialog', { name: 'Invitaciones a «Medicina 2027»' });
  await expect(result).toContainText('1 persona invitada, 1 ya estaba y 1 correo rechazado.');
  await expect(result).toContainText('alguien@gmail.com · no es @ug.uchile.cl');
  // The names were never sent: nothing of them comes back.
  await expect(result).not.toContainText('Díaz');
  await expect(result).not.toContainText('Alguien');
  await result.getByRole('button', { name: 'Listo' }).click();
  const list = page.getByRole('article', { name: 'Lista Medicina 2027' });
  await expect(list).toContainText('rosa.diaz@ug.uchile.cl');

  await list.getByRole('button', { name: 'Sacar a rosa.diaz@ug.uchile.cl' }).click();
  const remove = page.getByRole('dialog', { name: 'Sacar a rosa.diaz@ug.uchile.cl' });
  const go = remove.getByRole('button', { name: 'Sacar', exact: true });
  await expect(go).toBeDisabled();
  await remove.getByLabel(/Para confirmar/).fill('rosa.diaz@ug.uchile.cl');
  await go.click();
  const done = page.getByRole('dialog', { name: 'Listo' });
  await expect(done).toContainText('1 invitación sacada y 1 sesión cerrada.');
  await done.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('article', { name: 'Lista Medicina 2027' })).toHaveCount(0);

  // A list of only administrators has no «Sacar la lista» (it would take out nobody; Revisión de cero, 2.10).
  const team = page.getByRole('article', { name: 'Lista Equipo' });
  await expect(team.getByRole('button', { name: 'Sacar la lista' })).toHaveCount(0);
  // With someone else in it, it has; the administrator stays, with the reason.
  await page.getByRole('button', { name: /^Lista: / }).click();
  await page.getByRole('menuitemradio', { name: 'Equipo' }).click();
  await page.getByLabel('Correos @ug.uchile.cl').fill('ayudante@ug.uchile.cl');
  await button.click();
  const more = page.getByRole('dialog', { name: 'Invitaciones a «Equipo»' });
  await expect(more).toContainText('1 persona invitada.');
  await more.getByRole('button', { name: 'Listo' }).click();
  await team.getByRole('button', { name: 'Sacar la lista' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sacar la lista «Equipo»' });
  await expect(dialog).toContainText('Se borra 1 invitación y se cierran sus sesiones');
  await dialog.getByLabel(/Para confirmar/).fill('Equipo');
  await dialog.getByRole('button', { name: 'Sacar la lista' }).click();
  const gone = page.getByRole('dialog', { name: 'Listo' });
  await expect(gone).toContainText('Salieron (1)');
  await expect(gone).toContainText('Se mantuvo (1) · es administrador');
  expect(browserDialogs).toEqual([]);
});

test('«Acceso», step 2.10 b: the owner names an administrator and removes them, with popups of their own', async ({
  page,
}) => {
  const browserDialogs: string[] = [];
  page.on('dialog', (d) => {
    browserDialogs.push(d.type());
    void d.dismiss();
  });
  await signIn(page);
  await page.goto('/admin/access');
  const course = page.getByRole('article', { name: 'Lista Curso de prueba' });
  const name = course.getByRole('button', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' });
  await expect(name).toBeVisible();
  // The demo's user is the owner: their own row says so, without buttons.
  const team = page.getByRole('article', { name: 'Lista Equipo' });
  await expect(team.getByText('Dueño', { exact: true })).toBeVisible();
  await expect(team.getByRole('button', { name: /administrador a / })).toHaveCount(0);
  // Nothing wider than the screen (the phone too).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await name.click();
  const dialog = page.getByRole('dialog', { name: 'Hacer administrador a ana.perez@ug.uchile.cl' });
  const go = dialog.getByRole('button', { name: 'Hacer administrador', exact: true });
  await expect(go).toBeDisabled();
  await dialog.getByLabel(/Para confirmar/).fill('Ana.Perez@ug.uchile.cl');
  await go.click();
  const done = page.getByRole('dialog', { name: 'Listo' });
  await expect(done).toContainText('ana.perez@ug.uchile.cl ya es administrador.');
  await done.getByRole('button', { name: 'Listo' }).click();
  await expect(course.getByText('Administrador', { exact: true })).toBeVisible();
  await expect(course.getByRole('button', { name: 'Sacar a ana.perez@ug.uchile.cl' })).toHaveCount(
    0,
  );

  await course
    .getByRole('button', { name: 'Quitar administrador a ana.perez@ug.uchile.cl' })
    .click();
  const remove = page.getByRole('dialog', {
    name: 'Quitar administrador a ana.perez@ug.uchile.cl',
  });
  await expect(remove).toContainText('Deja de poder cambiar cosas de inmediato');
  await expect(remove).toContainText('hasta un minuto');
  await remove.getByLabel(/Para confirmar/).fill('ana.perez@ug.uchile.cl');
  await remove.getByRole('button', { name: 'Quitar administrador', exact: true }).click();
  const gone = page.getByRole('dialog', { name: 'Listo' });
  await expect(gone).toContainText('ana.perez@ug.uchile.cl ya no es administrador.');
  await gone.getByRole('button', { name: 'Listo' }).click();
  await expect(
    course.getByRole('button', { name: 'Sacar a ana.perez@ug.uchile.cl' }),
  ).toBeVisible();
  expect(browserDialogs).toEqual([]);
});

test('«Acceso», step 2.10 b: another administrator uses it, without naming or removing administrators', async ({
  page,
}) => {
  await page.addInitScript(() => window.localStorage.setItem('qv-demo-role', 'admin'));
  await signIn(page);
  await page.goto('/admin/access');
  await expect(page.getByRole('button', { name: 'Sacar a ana.perez@ug.uchile.cl' })).toBeVisible();
  await expect(page.getByRole('button', { name: /administrador a / })).toHaveCount(0);
});

test('«Fuera del sitio»: what is off now and the record, only to look at', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/unpublished');
  const now = page.getByRole('region', { name: 'Ahora fuera del sitio' });
  await expect(now.getByRole('listitem')).toHaveCount(2);
  await expect(now).toContainText('Figura con un error');
  // The image is not in the store: off the site.
  await expect(now).toContainText('Imagen de prueba que se sacó');
  await expect(now.getByText('Fuera del sitio', { exact: true })).toHaveCount(2);
  const log = page.getByRole('region', { name: 'Registro' });
  await expect(log.getByRole('listitem')).toHaveCount(3);
  await expect(log).toContainText('Volvió al sitio');
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
});
