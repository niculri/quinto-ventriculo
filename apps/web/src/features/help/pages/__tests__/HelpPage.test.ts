// Tests the help page: each box of the articles is explained with the label and color the articles give it, the
// search shortcut reads as this system writes it, and the way back goes home.
import { screen, within } from '@testing-library/react';
import { CALLOUT_LABELS, CONTACT_EMAIL } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../../test/render';

describe('«Ayuda»', () => {
  it('each box is explained under the label and with the color class the articles use', async () => {
    renderApp('/help');
    const section = (await screen.findByRole('heading', { name: 'Los recuadros de los apuntes' }))
      .parentElement!;
    const boxes = [...section.querySelectorAll('aside')];
    expect(boxes.length).toBeGreaterThan(5);
    for (const box of boxes) {
      const type = [...box.classList]
        .find((c) => c.startsWith('callout-'))!
        .slice('callout-'.length);
      const label = box.querySelector('.callout-label')!.textContent;
      expect(label).toBe(CALLOUT_LABELS[type]);
      expect(label).not.toBe('');
      expect(box.lastElementChild!.textContent).not.toBe('');
    }
    expect(new Set(boxes.map((b) => b.className)).size).toBe(boxes.length);
  });

  it('the shortcut of the search reads as this system writes it, and the way back goes home', async () => {
    renderApp('/help');
    const shortcuts = (await screen.findByRole('heading', { name: 'Atajos de teclado' }))
      .parentElement!;
    expect(within(shortcuts).getByText('Ctrl+K').tagName).toBe('KBD');
    expect(
      within(shortcuts).getByText('Abrir el buscador desde cualquier página'),
    ).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Ruta' });
    expect(within(crumbs).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument();
  });

  it('says what changes from Anki, with the study shortcuts, and where reports are', async () => {
    renderApp('/help');
    const cards = (
      await screen.findByRole('heading', { name: 'Las tarjetas: lo que cambia respecto de Anki' })
    ).parentElement!;
    for (const term of ['Dos botones', 'La fecha de la prueba', 'Deshacer', 'Modo avanzado']) {
      expect(within(cards).getByText(term).tagName).toBe('DT');
    }
    expect(within(cards).getByRole('link', { name: 'Mis reportes' })).toHaveAttribute(
      'href',
      '/settings/reports',
    );
    const shortcuts = screen.getByRole('heading', { name: 'Atajos de teclado' }).parentElement!;
    expect(within(shortcuts).getByText('Ctrl+Z').tagName).toBe('KBD');
    expect(within(shortcuts).getByText('Espacio o Enter')).toBeInTheDocument();
  });

  it('says what to do when something fails, with the contact address', async () => {
    renderApp('/help');
    const trouble = (await screen.findByRole('heading', { name: 'Si algo falla' })).parentElement!;
    expect(within(trouble).getByText(/Vuelve a cargar la página/)).toBeInTheDocument();
    expect(within(trouble).getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    );
  });
});
