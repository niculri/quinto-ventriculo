// Characterizes «Datos de usuario», the deletion popup and the popups on entering: what each says while busy, on an
// error and without data, with their text nodes.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_VERSIONS } from '@qv/schema';
import { acceptedAccount } from '../../../test/fakes/repositories';
import { SESSION_ANA } from '../../../test/fixtures/session';
import { renderApp } from '../../../test/render';
import { AccountError, localAccountRepository } from '../api/repository';
import { textNodes } from '../../../test/dom';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';

afterEach(() => {
  vi.restoreAllMocks();
});

const main = () => within(screen.getByRole('main'));

describe('«Datos de usuario»', () => {
  it('the account as Google gives it, and what it says without a name, a picture or dates', async () => {
    renderApp('/settings/account', {
      session: {
        ...SESSION_ANA,
        user: { ...SESSION_ANA.user, name: null, createdAt: null, lastSignInAt: null },
      },
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Datos de usuario' }),
    ).toBeInTheDocument();
    const card = main().getByRole('region', { name: 'Tu cuenta' });
    expect(within(card).getByRole('img', { name: 'Sin foto' })).toHaveTextContent('A');
    expect(within(card).getByText('Sin nombre')).toBeInTheDocument();
    expect(within(card).getByText('Google no lo entregó')).toBeInTheDocument();
    expect(within(card).getAllByText('Sin dato')).toHaveLength(2);
    expect(within(card).getByText('Nombre').tagName).toBe('DT');
    expect(main().getByRole('region', { name: 'Sesión' })).toBeInTheDocument();
  });

  it('with a picture, its alt, and the dates of the account', async () => {
    renderApp('/settings/account', {
      session: {
        ...SESSION_ANA,
        user: { ...SESSION_ANA.user, avatar: 'https://example.test/a.png' },
      },
    });
    const card = await screen.findByRole('region', { name: 'Tu cuenta' });
    expect(within(card).getByRole('img', { name: 'Tu foto de Google' })).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    );
    expect(within(card).getByText('Cuenta creada el')).toBeInTheDocument();
    expect(within(card).getByText(/^31 de octubre de 2026\D+10:00$/)).toBeInTheDocument();
  });

  it('says when the terms in force are not accepted yet', async () => {
    renderApp('/settings/account', {
      account: localAccountRepository({ email: SESSION_ANA.user.email }),
    });
    expect(
      await screen.findByText(
        'Todavía no aceptas la versión vigente de los términos de uso y de la política de privacidad: sin aceptarlos no se ve el material.',
      ),
    ).toBeInTheDocument();
  });

  it('«Descargar mis datos» says it is preparing the file, and that it could not', async () => {
    const account = acceptedAccount();
    let fail: (e: Error) => void = () => undefined;
    vi.spyOn(account, 'exportData').mockImplementation(
      () => new Promise((_, reject) => (fail = reject)),
    );
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));
    const busy = main().getByRole('button', { name: 'Preparando el archivo…' });
    expect(busy).toBeDisabled();
    expect(textNodes(busy)).toEqual(['Preparando el archivo…']);
    await act(async () => fail(new Error('x')));
    expect(await main().findByRole('alert')).toHaveTextContent(
      'No se pudo preparar el archivo. Revisa tu conexión e intenta de nuevo.',
    );
    expect(main().getByRole('button', { name: 'Descargar mis datos' })).toBeEnabled();
  });

  it('the deletion and the session say what happens, and «Cerrar sesión» says it is leaving', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/settings/account');
    expect(
      await screen.findByText(
        `Se cierran tus sesiones y, 7 días después, se borra todo lo tuyo. Si vuelves a entrar antes, se cancela.`,
      ),
    ).toBeInTheDocument();
    expect(
      main().getByText(
        'Cierra tu sesión en todos tus dispositivos. Tu avance queda guardado en tu cuenta.',
      ),
    ).toBeInTheDocument();
    let out: () => void = () => undefined;
    session.signOut = () => new Promise((resolve) => (out = resolve));
    await user.click(main().getByRole('button', { name: 'Cerrar sesión' }));
    expect(main().getByRole('button', { name: 'Cerrando sesión…' })).toBeDisabled();
    await act(async () => out());
  });
});

describe('the deletion popup', () => {
  it('says what a refusal it does not know means', async () => {
    const account = acceptedAccount();
    vi.spyOn(account, 'requestDeletion').mockRejectedValue(new Error('red'));
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    expect(within(dialog).getByText(/Para confirmar, escribe tu correo/)).toHaveTextContent(
      `Para confirmar, escribe tu correo (${SESSION_ANA.user.email})`,
    );
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
    await user.type(within(dialog).getByLabelText(/Para confirmar/), SESSION_ANA.user.email);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se pudo pedir. Revisa tu conexión e intenta de nuevo.',
    );
  });

  it('once asked, the date is in its own text nodes', async () => {
    const account = acceptedAccount();
    vi.spyOn(account, 'requestDeletion').mockResolvedValue({ deleteAfter: '2026-11-15T15:00:00Z' });
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    await user.type(within(dialog).getByLabelText(/Para confirmar/), SESSION_ANA.user.email);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    const done = await screen.findByRole('dialog', { name: 'Pediste eliminar tu cuenta' });
    const text = within(done).getByText(/Se cerraron tus sesiones/);
    expect(textNodes(text)).toEqual([
      'Se cerraron tus sesiones en todos tus dispositivos. Tu cuenta se borrará el',
      ' ',
      expect.stringMatching(/^15 de noviembre de 2026\D+12:00$/),
      ' (a lo más una hora después). Si vuelves a entrar antes, se cancela y todo sigue como estaba.',
    ]);
  });
});

describe('the popups on entering', () => {
  it('the terms to accept, with their versions, «Guardando…» and an error it does not know', async () => {
    const account = localAccountRepository({ email: SESSION_ANA.user.email });
    let fail: (e: Error) => void = () => undefined;
    vi.spyOn(account, 'accept').mockImplementation(
      () => new Promise((_, reject) => (fail = reject)),
    );
    const user = userEvent.setup();
    renderApp('/home', { account });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    expect(
      within(dialog).getByText(
        'Para usar El Quinto Ventrículo, lee y acepta los términos de uso y la política de privacidad.',
      ),
    ).toBeInTheDocument();
    const terms = within(dialog).getByRole('link', { name: 'Términos de uso' }).closest('li')!;
    expect(textNodes(terms)).toEqual([
      'Términos de uso',
      ' ',
      '· versión ',
      LEGAL_VERSIONS.terms.version,
      ', ',
      expect.stringMatching(/^\d+ de \w+ de \d{4}$/),
    ]);
    expect(
      within(dialog).getByRole('link', { name: 'Descargar mis datos o eliminar mi cuenta' }),
    ).toHaveAttribute('href', '/settings/account');
    await user.click(within(dialog).getByRole('button', { name: 'Acepto' }));
    expect(within(dialog).getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await act(async () => fail(new Error('x')));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'No se pudo guardar. Revisa tu conexión e intenta de nuevo.',
      ),
    );
  });

  it('when the account state cannot be read, says so with «Reintentar»', async () => {
    const account = acceptedAccount();
    vi.spyOn(account, 'resume').mockRejectedValue(new Error('Sin conexión de prueba'));
    renderApp('/home', { account });
    expect(await screen.findByText('No se pudo entrar')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión de prueba')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('the account state is asked for once per page load, also after leaving the site for a fixed page', async () => {
    const account = acceptedAccount();
    const resume = vi.spyOn(account, 'resume');
    const { router } = renderApp('/home', { account });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    await act(() => router.navigate('/terms'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos de uso' }),
    ).toBeInTheDocument();
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('the account state is asked for three times before saying it could not', async () => {
    const account = acceptedAccount();
    const resume = vi.spyOn(account, 'resume').mockRejectedValue(new Error('Sin conexión'));
    renderApp('/home', { account });
    expect(await screen.findByText('No se pudo entrar')).toBeInTheDocument();
    expect(resume).toHaveBeenCalledTimes(3);
  });

  it('a session closed elsewhere signs out at once, saying only that it is loading', async () => {
    const account = acceptedAccount();
    const resume = vi
      .spyOn(account, 'resume')
      .mockRejectedValue(new AccountError('session_closed', 'Tu sesión se cerró en otro lado.'));
    const { session } = renderApp('/home', { account });
    let signOuts = 0;
    session.signOut = () => {
      signOuts++;
      return new Promise(() => undefined);
    };
    await waitFor(() => expect(signOuts).toBe(1));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(screen.queryByText('No se pudo entrar')).toBeNull();
    expect(screen.queryByText('Tu sesión se cerró en otro lado.')).toBeNull();
  });

  it('a new privacy policy with the same terms asks again, saying that it changed', async () => {
    renderApp('/home', {
      account: localAccountRepository({
        email: SESSION_ANA.user.email,
        initial: {
          accepted: {
            terms: LEGAL_VERSIONS.terms.version,
            privacy: '0',
            acceptedAt: '2026-01-01T00:00:00Z',
          },
        },
      }),
    });
    expect(
      await screen.findByRole('dialog', {
        name: 'Cambiaron los términos o la política de privacidad',
      }),
    ).toBeInTheDocument();
  });

  it('before accepting, a deletion that entering cancelled is said in the same popup, and only once', async () => {
    const user = userEvent.setup();
    renderApp('/home', {
      account: localAccountRepository({
        email: SESSION_ANA.user.email,
        initial: {
          deletion: { requestedAt: '2026-11-08T12:00:00Z', deleteAfter: '2026-11-15T12:00:00Z' },
        },
      }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    expect(
      within(dialog).getByText(
        'Se canceló la eliminación de tu cuenta: entraste antes de que se borrara, y sigue con todo tu avance.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Acepto' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('what the database says when it refuses the acceptance is shown as it is', async () => {
    const account = localAccountRepository({ email: SESSION_ANA.user.email });
    vi.spyOn(account, 'accept').mockRejectedValue(
      new AccountError('unknown', 'La base de prueba no guardó la aceptación.'),
    );
    const user = userEvent.setup();
    renderApp('/home', { account });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    await user.click(within(dialog).getByRole('button', { name: 'Acepto' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'La base de prueba no guardó la aceptación.',
    );
  });

  it('«Cerrar sesión» in the popup goes to the landing page without a destination to come back to', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home', {
      account: localAccountRepository({ email: SESSION_ANA.user.email }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/'),
    );
  });
});

describe('«Datos de usuario»: the corners', () => {
  const EMAIL = SESSION_ANA.user.email;

  it('the file of «Descargar mis datos» is named by the day in Santiago, and the button is ready again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T01:30:00Z'));
    try {
      const account = acceptedAccount();
      vi.spyOn(account, 'exportData').mockResolvedValue(new Blob(['{}']));
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
      const clicked: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked.push(this.download);
      });
      const user = userEvent.setup({ advanceTimers: () => undefined });
      renderApp('/settings/account', { account });
      await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));
      await waitFor(() =>
        expect(clicked).toEqual(['el-quinto-ventriculo-mis-datos-2026-11-09.json']),
      );
      expect(await screen.findByRole('button', { name: 'Descargar mis datos' })).toBeEnabled();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('with the terms of an older version accepted, it says that the ones in force are not', async () => {
    renderApp('/settings/account', {
      account: localAccountRepository({
        email: EMAIL,
        initial: {
          accepted: {
            terms: LEGAL_VERSIONS.terms.version,
            privacy: '0',
            acceptedAt: '2026-01-01T00:00:00Z',
          },
        },
      }),
    });
    expect(
      await screen.findByText(/^Todavía no aceptas la versión vigente de los términos de uso/),
    ).toBeInTheDocument();
  });

  it('«Cerrar sesión» leaves for the bare landing page, with no destination to come back to', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/settings/account');
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/'),
    );
  });

  it('the deletion popup asks only with the account’s email, also by Enter, and starts over after cancelling', async () => {
    const account = acceptedAccount();
    const request = vi
      .spyOn(account, 'requestDeletion')
      .mockRejectedValue(new AccountError('email_mismatch', 'Ese correo no es el de la cuenta.'));
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    let dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    const email = within(dialog).getByLabelText(/Para confirmar/);
    await user.type(email, 'otra@ug.uchile.cl{Enter}');
    expect(request).not.toHaveBeenCalled();
    await user.clear(email);
    await user.type(email, `${EMAIL}{Enter}`);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ese correo no es el de la cuenta.',
    );
    expect(request).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }));
    dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    expect(within(dialog).getByLabelText(/Para confirmar/)).toHaveValue('');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('while it asks the ✕ waits, and once asked neither Escape nor a click outside leave: «Entendido» goes to the landing page replacing the entry', async () => {
    const account = acceptedAccount();
    let answer: (v: { deleteAfter: string }) => void = () => undefined;
    vi.spyOn(account, 'requestDeletion').mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { router, session } = renderApp('/settings/account', { account });
    const signOut = vi.spyOn(session, 'signOut');
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    await user.type(within(dialog).getByLabelText(/Para confirmar/), EMAIL);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await within(dialog).findByRole('button', { name: 'Cerrar' })).toBeDisabled();
    await act(async () => answer({ deleteAfter: '2026-11-15T15:00:00Z' }));
    const done = await screen.findByRole('dialog', { name: 'Pediste eliminar tu cuenta' });
    await user.keyboard('{Escape}');
    await user.click(document.body);
    expect(screen.getByRole('dialog', { name: 'Pediste eliminar tu cuenta' })).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    await user.click(within(done).getByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(router.state.location.search).toBe('?notice=deletion'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('if signing out fails, «Entendido» still clears what the page knew and goes on', async () => {
    const account = acceptedAccount();
    vi.spyOn(account, 'requestDeletion').mockResolvedValue({ deleteAfter: '2026-11-15T15:00:00Z' });
    const clear = vi.spyOn(QueryClient.prototype, 'clear');
    const user = userEvent.setup();
    const { router, session } = renderApp('/settings/account', { account });
    session.signOut = async () => {
      throw new Error('red');
    };
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    await user.type(within(dialog).getByLabelText(/Para confirmar/), EMAIL);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    const done = await screen.findByRole('dialog', { name: 'Pediste eliminar tu cuenta' });
    await user.click(within(done).getByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('the popups on entering: what cannot be dismissed', () => {
  it('neither Escape nor a click outside closes the terms popup, and its links open in another tab', async () => {
    const user = userEvent.setup();
    renderApp('/home', { account: localAccountRepository({ email: SESSION_ANA.user.email }) });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    await user.keyboard('{Escape}');
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: 'Antes de entrar' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cerrar' })).toBeNull();
    for (const name of ['Términos de uso', 'Política de privacidad']) {
      const link = within(dialog).getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener');
    }
  });
});

describe('the popups after entering', () => {
  const termsRefused = () =>
    fakeApi({
      catalog: async () => {
        throw new ApiRequestError(403, 'terms_not_accepted', 'Acepta los términos.');
      },
    });

  it('«Recargar» reloads the page, and neither Escape nor a click outside closes the notice', async () => {
    const user = userEvent.setup();
    renderApp('/home', { api: termsRefused() });
    const dialog = await screen.findByRole('dialog', { name: 'Hay una versión nueva del sitio' });
    await user.keyboard('{Escape}');
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: 'Hay una versión nueva del sitio' })).toBe(dialog);
    const reload = vi.fn();
    vi.stubGlobal('location', { href: window.location.href, reload });
    try {
      await user.click(within(dialog).getByRole('button', { name: 'Recargar' }));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('before accepting, a refusal for the terms reads the account state again instead of offering to reload', async () => {
    const account = localAccountRepository({ email: SESSION_ANA.user.email });
    const resume = vi.spyOn(account, 'resume');
    renderApp('/settings/account', { account, api: termsRefused() });
    await waitFor(() => expect(resume.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByRole('dialog', { name: 'Hay una versión nueva del sitio' })).toBeNull();
  });
});
