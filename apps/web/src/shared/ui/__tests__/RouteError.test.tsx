// Tests the notice of a page that crashed: it replaces the page, logs the error and offers to reload or go home.
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteError } from '../RouteError';

afterEach(() => vi.restoreAllMocks());

function Broken(): never {
  throw new Error('se rompió');
}

describe('a page that crashed', () => {
  it('shows the notice with its way out home, and logs what happened', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <RouteError /> },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algo salió malRecarga la página. Si sigue pasando, vuelve al inicio.',
    );
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/home');
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'se rompió' })),
    );
  });
});
