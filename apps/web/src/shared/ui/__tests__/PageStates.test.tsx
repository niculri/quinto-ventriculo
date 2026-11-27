// Tests a page that loads or failed in the page's frame: the breadcrumbs' row and the title where every page has them,
// the real ones when known, and the spinner or the error below.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PageError, PageLoading } from '../PageStates';

const CRUMBS = [{ label: 'Inicio', to: '/home' }, { label: 'Anatomía' }];

describe('PageLoading', () => {
  it('without the catalog: the rows of the breadcrumbs and the title kept, and «Cargando…»', () => {
    const { container } = render(<PageLoading />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(container.querySelector('.mb-4.h-5')).not.toBeNull();
    expect(container.querySelector('.h-9 .animate-pulse')).not.toBeNull();
  });

  it('with what is known: the real breadcrumbs and title', () => {
    render(
      <MemoryRouter>
        <PageLoading crumbs={CRUMBS} title="Anatomía" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toHaveTextContent('InicioAnatomía');
    expect(screen.getByRole('heading', { level: 1, name: 'Anatomía' })).toBeInTheDocument();
  });
});

describe('PageError', () => {
  it('keeps the breadcrumbs and the title, and «Reintentar» asks again', async () => {
    const retry = vi.fn();
    render(
      <MemoryRouter>
        <PageError error={new Error('x')} onRetry={retry} crumbs={CRUMBS} title="Anatomía" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Anatomía' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('without them: the box at the start of the page, not centered, and no gray title', () => {
    const { container } = render(<PageError error={new Error('x')} onRetry={() => undefined} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(screen.getByRole('alert').parentElement).toHaveClass('max-w-lg');
    expect(screen.getByRole('alert').parentElement).not.toHaveClass('mx-auto');
  });
});
