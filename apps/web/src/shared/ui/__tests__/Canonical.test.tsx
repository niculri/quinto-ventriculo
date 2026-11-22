// Tests the redirect to a canonical URL: it keeps the current query under the path's own, and the anchor.
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Canonical } from '../Canonical';

function go(from: string, path: string) {
  const router = createMemoryRouter(
    [
      { path: '/old', element: <Canonical path={path} /> },
      { path: '*', element: null },
    ],
    { initialEntries: [from] },
  );
  render(<RouterProvider router={router} />);
  return router.state;
}

describe('the canonical redirect', () => {
  it('keeps the query and the anchor, and replaces the old entry', () => {
    const state = go('/old?q=ribo#poros', '/new');
    expect(state.location).toMatchObject({ pathname: '/new', search: '?q=ribo', hash: '#poros' });
    expect(state.historyAction).toBe('REPLACE');
  });

  it('the path’s own query wins over the same key of the old one, and the rest is added', () => {
    const state = go('/old?view=list&day=2026-11-10', '/new?view=grid');
    expect(state.location.search).toBe('?view=grid&day=2026-11-10');
  });

  it('adds no «?» when there is no query', () => {
    expect(go('/old', '/new').location.search).toBe('');
  });
});
