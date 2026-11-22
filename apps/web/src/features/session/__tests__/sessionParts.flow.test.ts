// Characterizes the return from Google: the destination it goes on to and forgets, and an error in the hash.
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';

afterEach(() => {
  window.sessionStorage.clear();
});

describe('the return from Google', () => {
  it('goes on to the destination saved before leaving, and forgets it', async () => {
    window.sessionStorage.setItem('qv-next', '/semesters/2/courses/biologia-celular');
    const { router } = renderApp('/auth/callback');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/semesters/2/courses/biologia-celular'),
    );
    expect(window.sessionStorage.getItem('qv-next')).toBeNull();
  });

  it('an error that Supabase leaves in the hash is shown as the landing page’s notice', async () => {
    const { router } = renderApp(
      '/auth/callback#error=access_denied&error_description=Solo+entran+personas+invitadas',
      { session: null },
    );
    await waitFor(() => expect(router.state.location.search).toBe('?notice=invite'));
    expect(
      await screen.findByText(/está en prueba y por ahora solo entran personas invitadas/),
    ).toBeInTheDocument();
  });
});
