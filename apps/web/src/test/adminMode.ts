// What a test does with the admin mode's row of the account menu: switch it, read it, or check it is not there.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ACCOUNT = { name: /tu cuenta$/i };
const MODE = { name: /^Modo admin/ };

async function openMenu() {
  await userEvent.click(await screen.findByRole('button', ACCOUNT));
}

/** Opens the account menu and clicks the row «Modo admin». */
export async function toggleAdminMode() {
  await openMenu();
  await userEvent.click(await screen.findByRole('menuitemcheckbox', MODE));
}

/** Whether the row is on (the menu is opened and closed again). */
export async function adminModeIsOn(): Promise<boolean> {
  await openMenu();
  const on = (await screen.findByRole('menuitemcheckbox', MODE)).getAttribute('aria-checked');
  await userEvent.keyboard('{Escape}');
  return on === 'true';
}

/** Whether the account menu has the row at all (it is opened and closed again). */
export async function hasAdminModeRow(): Promise<boolean> {
  await openMenu();
  await screen.findByRole('menuitem', { name: /Opciones/ });
  const row = screen.queryByRole('menuitemcheckbox', MODE);
  await userEvent.keyboard('{Escape}');
  return row !== null;
}
