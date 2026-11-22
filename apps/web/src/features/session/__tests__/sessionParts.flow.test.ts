// Characterizes the return from Google: the destination it goes on to and forgets, and an error in the hash.
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test/render';

afterEach(() => {
  vi.restoreAllMocks();
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

  it('back without a session nor an error goes to the landing page, without a notice, and forgets the destination', async () => {
    window.sessionStorage.setItem('qv-next', '/semesters/2');
    const { router } = renderApp('/auth/callback', { session: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
    expect(window.sessionStorage.getItem('qv-next')).toBeNull();
  });

  it('a destination outside the site is not followed: home instead', async () => {
    window.sessionStorage.setItem('qv-next', '//elsewhere.example.test/x');
    const { router } = renderApp('/auth/callback');
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it('with the storage blocked the destination cannot be read: home instead', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'qv-next') throw new Error('blocked');
      return null;
    });
    const { router } = renderApp('/auth/callback');
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });
});
