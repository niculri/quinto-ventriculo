// Tests the frame of the signed-in app: what studying hides, the phone's menu and the shortcuts to the quick search.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render';

const STUDY = '/semesters/1/courses/anatomia-1/anki/study';

describe('the frame', () => {
  it('a page has the bar with the phone’s menu button, the site’s menu, the right column and the footer', async () => {
    renderApp('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toHaveClass('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'Abrir el menú' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menú del sitio' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Columna derecha' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).not.toHaveClass('hidden');
  });

  it('studying hides the menu, the right column, the footer and, on a phone, the bar', async () => {
    renderApp(STUDY);
    await waitFor(() => expect(screen.getByRole('banner')).toHaveClass('max-sm:hidden'));
    expect(screen.queryByRole('button', { name: 'Abrir el menú' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Menú del sitio' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Columna derecha' })).toBeNull();
    expect(document.querySelector('footer')).toHaveClass('hidden');
  });

  it('the phone’s menu opens with its button, closes with Escape and on going to a page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home');
    await user.click(await screen.findByRole('button', { name: 'Abrir el menú' }));
    expect(await screen.findByRole('dialog', { name: 'Menú' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Abrir el menú' }));
    const menu = await screen.findByRole('dialog', { name: 'Menú' });
    await user.click(within(menu).getByRole('link', { name: '2° Semestre' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(router.state.location.pathname).toBe('/semesters/2'));
  });

  it('⌘K and Ctrl+K open the quick search anywhere and keep the browser’s own, «/» only outside a text field', async () => {
    const user = userEvent.setup();
    renderApp('/search');
    const box = await screen.findByRole('searchbox');
    const search = () => screen.queryByRole('combobox', { name: 'Buscar en la página' });
    expect(fireEvent.keyDown(window, { key: 'k', metaKey: true })).toBe(false);
    expect(
      await screen.findByRole('combobox', { name: 'Buscar en la página' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(search()).toBeNull());
    expect(fireEvent.keyDown(window, { key: 'k', ctrlKey: true })).toBe(false);
    expect(
      await screen.findByRole('combobox', { name: 'Buscar en la página' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(search()).toBeNull());
    expect(fireEvent.keyDown(box, { key: '/' })).toBe(true);
    expect(search()).toBeNull();
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false);
    expect(
      await screen.findByRole('combobox', { name: 'Buscar en la página' }),
    ).toBeInTheDocument();
  });

  it('the search box of the bar opens the quick search', async () => {
    const user = userEvent.setup();
    renderApp('/home');
    await user.click(await screen.findByRole('button', { name: /Buscar en la página…/ }));
    expect(
      await screen.findByRole('combobox', { name: 'Buscar en la página' }),
    ).toBeInTheDocument();
  });

  it('the phone’s menu goes away on starting to study, even if it was left open', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home');
    await user.click(await screen.findByRole('button', { name: 'Abrir el menú' }));
    expect(await screen.findByRole('dialog', { name: 'Menú' })).toBeInTheDocument();
    await act(() => router.navigate(STUDY));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menú' })).toBeNull());
  });
});
