// Characterizes «Datos de usuario», the deletion popup and the popups on entering: what each says while busy, on an
// error and without data, with their text nodes.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_VERSIONS } from '@qv/schema';
import { SESSION_ANA, acceptedAccount, renderApp } from '../../../test/render';
import { localAccountRepository } from '../api/repository';

afterEach(() => {
  vi.restoreAllMocks();
});

const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

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
});
