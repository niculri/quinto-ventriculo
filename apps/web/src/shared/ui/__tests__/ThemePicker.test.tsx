// Tests the theme picker: it starts on the saved theme (light when none is), and choosing one applies and saves it without closing the menu.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MenuRoot } from '../MenuRoot';
import { ThemePicker } from '../ThemePicker';

function Opened() {
  return (
    <MenuRoot>
      <Menu.Trigger>Cuenta</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content>
          <ThemePicker />
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}

async function openMenu() {
  render(<Opened />);
  await userEvent.click(screen.getByRole('button', { name: 'Cuenta' }));
  await screen.findByRole('menu');
}

afterEach(() => document.documentElement.classList.remove('dark'));

describe('the theme picker', () => {
  it('starts on the saved theme', async () => {
    localStorage.setItem('qv-theme', 'system');
    await openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'Como el sistema' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('applies and saves the theme chosen, and the menu stays open to see it', async () => {
    await openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('qv-theme')).toBe('dark');
    expect(screen.getByRole('menuitemradio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
