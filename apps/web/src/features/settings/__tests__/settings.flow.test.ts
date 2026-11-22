// Tests «Opciones»: opening it from the user menu, its sections on the side and «Datos de usuario».

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';

describe('Opciones: Anki general y Configuración de mazos', () => {
  it('«Opciones» of the user menu opens its page, with its sections on the side', async () => {
    const { router } = renderApp('/home');
    await userEvent.click(await screen.findByRole('button', { name: /tu cuenta$/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Opciones/ }));
    expect(screen.queryByRole('menuitem', { name: /Anki/ })).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/account'));
    const nav = await screen.findByRole('navigation', { name: 'Secciones de las opciones' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => [l.textContent.trim(), l.getAttribute('href')])).toEqual([
      ['Datos de usuario', '/settings/account'],
      ['Mis reportes', '/settings/reports'],
      ['General', '/settings/anki'],
      ['Configuración de mazos', '/settings/deck-options'],
    ]);
    expect(
      within(nav)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-labelledby')),
    ).toHaveLength(2);
    expect(within(nav).getByRole('group', { name: 'Anki' })).toContainElement(links[2]!);
    expect(within(nav).getByRole('group', { name: 'Cuenta' })).toContainElement(links[0]!);
    expect(within(nav).getByRole('group', { name: 'Cuenta' })).toContainElement(links[1]!);
    expect(within(nav).queryByRole('link', { name: 'Anki' })).toBeNull();
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    await userEvent.click(links[2]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/anki'));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Anki general' }),
    ).toBeInTheDocument();
    const after = screen.getByRole('navigation', { name: 'Secciones de las opciones' });
    expect(within(after).getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('«Datos de usuario»: name, email, photo, dates of the account and «Cerrar sesión»', async () => {
    const { router } = renderApp('/settings');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Datos de usuario' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/account');
    const account = screen.getByRole('region', { name: 'Tu cuenta' });
    expect(within(account).getByRole('img', { name: 'Sin foto' })).toHaveTextContent('AP');
    expect(within(account).getAllByText('Ana Pérez').length).toBeGreaterThan(0);
    expect(within(account).getAllByText('ana@ug.uchile.cl').length).toBeGreaterThan(0);
    expect(within(account).getByText('31 de octubre de 2026 a las 10:00')).toBeInTheDocument();
    expect(within(account).getByText('1 de noviembre de 2026 a las 09:30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findAllByRole('button', { name: /Entrar con Google/ })).not.toHaveLength(0);
  });
});
