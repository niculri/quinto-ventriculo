// The tab's title follows the page and goes back to the site's name when it closes.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTitle } from '../useTitle';

function Page({ title }: { title: string | null }) {
  useTitle(title);
  return null;
}

describe('useTitle', () => {
  it('names the tab after the page, follows it and restores the site’s name', () => {
    const { rerender, unmount } = render(<Page title="Mis reportes" />);
    expect(document.title).toBe('Mis reportes · El Quinto Ventrículo');
    rerender(<Page title="Practicar" />);
    expect(document.title).toBe('Practicar · El Quinto Ventrículo');
    unmount();
    expect(document.title).toBe('El Quinto Ventrículo');
  });

  it('leaves the tab alone without a title, so that what the page shows instead can name it', () => {
    document.title = 'No encontrado · El Quinto Ventrículo';
    const { rerender, unmount } = render(<Page title={null} />);
    expect(document.title).toBe('No encontrado · El Quinto Ventrículo');
    rerender(<Page title="Inicio" />);
    expect(document.title).toBe('Inicio · El Quinto Ventrículo');
    rerender(<Page title={null} />);
    expect(document.title).toBe('El Quinto Ventrículo');
    unmount();
    expect(document.title).toBe('El Quinto Ventrículo');
  });
});
