// Tests the site map: a page whose code does not arrive (a deploy that removed it, or no network) shows the route's error.
import { screen } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';

vi.mock('../../features/help/pages/HelpPage', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const hasPath = (list: RouteObject[], path: string): boolean =>
  list.some((r) => r.path === path || hasPath(r.children ?? [], path));

describe('the routes', () => {
  it('a page whose code does not arrive says so with «Recargar» and the way home, instead of the router’s own', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp('/help');
    expect(await screen.findByText('Algo salió mal')).toBeInTheDocument();
    expect(
      screen.getByText('Recarga la página. Si sigue pasando, vuelve al inicio.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/home');
  });

  it('the made-up article for looking at the reading exists only in development', async () => {
    const dev = await import('../routes');
    expect(hasPath(dev.routes, 'dev/reading')).toBe(true);
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const built = await import('../routes');
    expect(hasPath(built.routes, 'dev/reading')).toBe(false);
    expect(hasPath(built.routes, 'help')).toBe(true);
  });
});
