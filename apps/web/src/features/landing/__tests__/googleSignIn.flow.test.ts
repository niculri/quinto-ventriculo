// Signing in with Google's own button on the landing page: ours waits in its place while it loads, the ID token goes
// with the raw nonce of the hash Google got, a refusal re-arms it with a new one, and who enters does not change.
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GoogleIdentity } from '../../session/api/googleIdentity';
import { sha256Hex } from '../../session/model/nonce';
import { renderApp } from '../../../test/render';
import { SESSION_ANA } from '../../../test/fixtures/session';

function fakeGoogle() {
  let settle: { resolve: (g: GoogleIdentity) => void; reject: (e: Error) => void } | null = null;
  const loaded = new Promise<GoogleIdentity>((resolve, reject) => (settle = { resolve, reject }));
  const starts: string[] = [];
  let give: (token: string) => void = () => undefined;
  const google: GoogleIdentity = {
    start(hashedNonce, onCredential) {
      starts.push(hashedNonce);
      give = onCredential;
    },
    renderButton(parent, style) {
      const b = document.createElement('button');
      b.textContent = `Google ${style.size}`;
      b.addEventListener('click', () => give(`token-${starts.length}`));
      parent.replaceChildren(b);
    },
  };
  return {
    load: vi.fn(() => loaded),
    starts,
    ready: async () => {
      await act(async () => settle?.resolve(google));
      await screen.findByRole('button', { name: 'Google large' });
    },
    fail: () => act(async () => settle?.reject(new Error('blocked'))),
    /** Google loads while the page is being left: nothing is armed. */
    loadAndLeave: async (unmount: () => void) => {
      settle?.resolve(google);
      unmount();
      await act(() => new Promise((r) => setTimeout(r, 20)));
    },
  };
}

const ours = () => screen.getByRole('button', { name: 'Entrar con Google' });

describe('while Google loads', () => {
  it('our buttons wait in their places, and «Entra de otra forma» already takes the redirect', async () => {
    const user = userEvent.setup();
    const g = fakeGoogle();
    const { session } = renderApp('/?next=%2Fhome', { session: null, google: g.load });
    expect(await screen.findByRole('button', { name: 'Entrar con Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    expect(screen.getByText(/¿No se abre la ventana de Google\?/)).not.toHaveClass('invisible');
    await user.click(screen.getByRole('button', { name: 'Entra de otra forma' }));
    expect(session.signIns).toEqual(['/home']);
    for (const b of screen.getAllByRole('button', { name: 'Abriendo Google…' })) {
      expect(b).toBeDisabled();
    }
  });

  it('if it does not load, ours is the button and the other way is hidden in its place', async () => {
    const g = fakeGoogle();
    renderApp('/', { session: null, google: g.load });
    await screen.findByRole('button', { name: 'Entrar con Google' });
    await g.fail();
    expect(ours()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(screen.getByText(/¿No se abre la ventana de Google\?/)).toHaveClass('invisible');
  });

  it('leaving the page before Google answers changes nothing', async () => {
    const g = fakeGoogle();
    const { unmount } = renderApp('/', { session: null, google: g.load });
    await screen.findByRole('button', { name: 'Entrar con Google' });
    unmount();
    await g.fail();
    expect(g.load).toHaveBeenCalledTimes(1);

    const late = fakeGoogle();
    const second = renderApp('/', { session: null, google: late.load });
    await screen.findByRole('button', { name: 'Entrar con Google' });
    await late.loadAndLeave(second.unmount);
    expect(late.starts).toEqual([]);
  });

  it('a build without Google has no other way line at all, and nothing is loaded for a signed-in person', async () => {
    renderApp('/', { session: null });
    expect(await screen.findByRole('button', { name: 'Entrar con Google' })).toBeEnabled();
    expect(screen.queryByText(/¿No se abre la ventana de Google\?/)).toBeNull();
    const g = fakeGoogle();
    const { router } = renderApp('/', { google: g.load });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(g.load).not.toHaveBeenCalled();
  });
});

describe('with Google ready', () => {
  it('draws Google in both places and enters with its token and the raw nonce of its hash', async () => {
    const user = userEvent.setup();
    const g = fakeGoogle();
    const { session, router } = renderApp('/?next=%2Fhome', { session: null, google: g.load });
    await screen.findByRole('button', { name: 'Entrar con Google' });
    await g.ready();
    expect(screen.queryByRole('button', { name: 'Entrar con Google' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Google medium' })).toBeInTheDocument();
    let entered: () => void = () => undefined;
    session.signInWithIdToken = (idToken, nonce) => {
      session.idTokens.push([idToken, nonce]);
      return new Promise((resolve) => (entered = resolve));
    };
    await user.click(screen.getByRole('button', { name: 'Google large' }));
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    const [[token, nonce]] = session.idTokens as [[string, string]];
    expect(token).toBe('token-1');
    expect(await sha256Hex(nonce)).toBe(g.starts[0]);
    expect(session.signIns).toEqual([]);
    await act(async () => {
      session.emit(SESSION_ANA);
      entered();
    });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it.each([
    [
      'El Quinto Ventrículo está en prueba: por ahora solo entran cuentas invitadas.',
      /por ahora solo entran personas invitadas/,
    ],
    [
      'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl.',
      /solo para cuentas @ug.uchile.cl. Entra con tu cuenta de la U/,
    ],
    ['Nonces mismatch', /No se pudo entrar con Google/],
  ])(
    'a refusal («%s») says why and arms Google again with a new nonce',
    async (message, notice) => {
      const user = userEvent.setup();
      const g = fakeGoogle();
      const { session } = renderApp('/', { session: null, google: g.load });
      await screen.findByRole('button', { name: 'Entrar con Google' });
      await g.ready();
      session.signInWithIdToken = async () => {
        throw new Error(message);
      };
      await user.click(screen.getByRole('button', { name: 'Google large' }));
      expect(await screen.findByText(notice)).toBeInTheDocument();
      expect(screen.getByText('No se pudo entrar')).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Google large' })).toBeInTheDocument();
      expect(g.starts).toHaveLength(2);
      expect(g.starts[1]).not.toBe(g.starts[0]);

      session.signInWithIdToken = () => new Promise(() => undefined);
      await user.click(screen.getByRole('button', { name: 'Google large' }));
      expect(screen.queryByText(notice)).toBeNull();
    },
  );

  it('an account of another domain that Google lets through is signed out, as with the redirect', async () => {
    const user = userEvent.setup();
    const g = fakeGoogle();
    const { session } = renderApp('/', { session: null, google: g.load });
    await screen.findByRole('button', { name: 'Entrar con Google' });
    await g.ready();
    const outsider = { ...SESSION_ANA, user: { ...SESSION_ANA.user, email: 'ana@gmail.com' } };
    session.signInWithIdToken = async () => session.emit(outsider);
    await user.click(screen.getByRole('button', { name: 'Google large' }));
    expect(
      await screen.findByText(/es solo para cuentas @ug.uchile.cl. Entra con tu cuenta de la U/),
    ).toBeInTheDocument();
    expect(await session.current()).toBeNull();
    expect(await screen.findByRole('button', { name: 'Google large' })).toBeInTheDocument();
  });
});
