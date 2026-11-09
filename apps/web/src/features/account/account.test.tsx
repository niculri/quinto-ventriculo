import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTACT_EMAIL, DATA_CONTROLLER, LEGAL_VERSIONS } from '@qv/schema';
import { ApiRequestError } from '../../lib/api';
import { SESSION_ANA, acceptedAccount, fakeApi, renderApp } from '../../test/render';
import { localAccountRepository } from './repository';
import type { AccountRepository } from './repository';

/** Step 2.3: /privacy and /terms, the acceptance on entering, downloading the data and deleting the account. */

const EMAIL = SESSION_ANA.user.email;
const notAccepted = (initial: Parameters<typeof localAccountRepository>[0] = {}) =>
  localAccountRepository({ email: EMAIL, ...initial });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/privacy and /terms', () => {
  it('the privacy policy opens without a session, with its version and date, and nothing of the material', async () => {
    renderApp('/privacy', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Versión ${LEGAL_VERSIONS.privacy.version} · 8 de noviembre de 2026`),
    ).toBeInTheDocument();
    expect(screen.queryByText('Traducción')).toBeNull();
    expect(screen.queryByRole('button', { name: /Entrar con Google/ })).toBeNull();
  });

  it('has every point the law asks of it (art. 14 ter)', async () => {
    renderApp('/privacy', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const part = (name: RegExp) => {
      const h = screen.getByRole('heading', { level: 2, name });
      return h.parentElement as HTMLElement;
    };
    // The controller and the contact.
    expect(part(/Quién es el responsable/)).toHaveTextContent(DATA_CONTROLLER);
    expect(
      within(part(/Quién es el responsable/)).getByRole('link', { name: CONTACT_EMAIL }),
    ).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`);
    // The kinds of data, from the users' database: the account, the sessions, the invitation, the cards, the tests,
    // the reports and the acceptance.
    const data = part(/Qué datos guardamos/);
    for (const kind of [
      /Tu cuenta/,
      /dirección IP/,
      /Tu invitación/,
      /historial de tus respuestas/,
      /Tus tests/,
      /Tus reportes de errores/,
      /Tu aceptación/,
      /Si pides eliminar tu cuenta/,
    ]) {
      expect(data).toHaveTextContent(kind);
    }
    expect(part(/De dónde salen/)).toHaveTextContent(/Google/);
    expect(part(/Para qué los usamos/)).toHaveTextContent(/No usamos tus datos para publicidad/);
    expect(part(/Por qué podemos usarlos/)).toHaveTextContent(/consentimiento/);
    expect(part(/Quién los ve/)).toHaveTextContent(/reportes de errores con el nombre y el correo/);
    const where = part(/Quién los procesa y dónde están/);
    expect(where).toHaveTextContent(/Supabase.*São Paulo, Brasil/);
    expect(where).toHaveTextContent(/Cloudflare/);
    expect(where).toHaveTextContent(/salen de Chile/);
    expect(part(/Cómo los cuidamos/)).toHaveTextContent(/cifrado/);
    const time = part(/Cuánto tiempo los guardamos/);
    expect(time).toHaveTextContent(/7 días para arrepentirte/);
    expect(time).toHaveTextContent(/36 meses sin entrar/);
    expect(time).toHaveTextContent(/quedan sin tu nombre ni tu correo/);
    const rights = part(/Tus derechos/);
    for (const right of [/Acceso y portabilidad/, /Rectificación/, /Supresión/, /Oposición/]) {
      expect(rights).toHaveTextContent(right);
    }
    expect(
      within(rights).getByRole('link', { name: 'Opciones → Datos de usuario' }),
    ).toHaveAttribute('href', '/settings/account');
    expect(part(/Si no estás conforme/)).toHaveTextContent(
      /Agencia de Protección de Datos Personales/,
    );
    expect(part(/Cambios a esta política/)).toHaveTextContent(/te pediremos aceptarla de nuevo/);
  });

  it('the terms say it is not official, not to share the material and that it is not medical advice', async () => {
    renderApp('/terms', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos de uso' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Versión ${LEGAL_VERSIONS.terms.version} · 8 de noviembre de 2026`),
    ).toBeInTheDocument();
    // In the text (the footer says it too, step 2.7).
    expect(within(screen.getByRole('main')).getByText(/sin relación oficial/)).toBeInTheDocument();
    expect(screen.getByText(/No lo copies ni lo compartas fuera del sitio/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '4. No es consejo médico' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('they open with a session too, without the popup', async () => {
    renderApp('/terms', { account: notAccepted() });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos de uso' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('accepting on entering', () => {
  it('without accepting, nothing of the site; «Acepto» lets in at once', async () => {
    const account = notAccepted();
    const accept = vi.spyOn(account, 'accept');
    const user = userEvent.setup();
    renderApp('/home', { account });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    expect(screen.queryByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Términos de uso' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(within(dialog).getByRole('link', { name: 'Política de privacidad' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    // It is answered, not closed.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Antes de entrar' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Acepto' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(accept).toHaveBeenCalledWith({
      terms: LEGAL_VERSIONS.terms.version,
      privacy: LEGAL_VERSIONS.privacy.version,
    });
  });

  it('a new version asks again, saying that it changed', async () => {
    renderApp('/home', {
      account: notAccepted({
        initial: { accepted: { terms: '0', privacy: '0', acceptedAt: '2026-01-01T00:00:00Z' } },
      }),
    });
    expect(
      await screen.findByRole('dialog', {
        name: 'Cambiaron los términos o la política de privacidad',
      }),
    ).toBeInTheDocument();
  });

  it('«Cerrar sesión» leaves, and «Datos de usuario» opens without accepting', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/home', { account: notAccepted() });
    const dialog = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    await user.click(
      within(dialog).getByRole('link', { name: 'Descargar mis datos o eliminar mi cuenta' }),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Datos de usuario' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Todavía no aceptas la versión vigente/)).toBeInTheDocument();
    await act(() => router.navigate('/home'));
    const again = await screen.findByRole('dialog', { name: 'Antes de entrar' });
    await user.click(within(again).getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('entering again cancels a deletion, and says so once', async () => {
    const user = userEvent.setup();
    renderApp('/home', {
      account: localAccountRepository({
        email: EMAIL,
        initial: {
          accepted: {
            terms: LEGAL_VERSIONS.terms.version,
            privacy: LEGAL_VERSIONS.privacy.version,
            acceptedAt: '2026-11-08T12:00:00Z',
          },
          deletion: { requestedAt: '2026-11-08T12:00:00Z', deleteAfter: '2026-11-15T12:00:00Z' },
        },
      }),
    });
    const dialog = await screen.findByRole('dialog', {
      name: 'Se canceló la eliminación de tu cuenta',
    });
    // The site is behind it (the popup is modal: the rest is hidden from the reader until it is closed).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hola, Ana', hidden: true }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('if the Worker asks for versions this page does not know, it offers to reload', async () => {
    renderApp('/home', {
      api: fakeApi({
        catalog: async () => {
          throw new ApiRequestError(
            403,
            'terms_not_accepted',
            'Para ver el material, acepta los términos de uso y la política de privacidad.',
          );
        },
      }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Hay una versión nueva del sitio' });
    expect(within(dialog).getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
  });
});

describe('«Datos de usuario»: download and delete', () => {
  it('says what was accepted and when, with the two texts', async () => {
    renderApp('/settings/account');
    expect(
      await screen.findByText(
        new RegExp(
          `Aceptaste los términos de uso \\(versión ${LEGAL_VERSIONS.terms.version}\\) y la política de privacidad`,
        ),
      ),
    ).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Términos y privacidad' });
    expect(within(section).getByRole('link', { name: 'Política de privacidad' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('«Descargar mis datos» saves the JSON the database built', async () => {
    const account: AccountRepository = acceptedAccount(EMAIL);
    const blob = new Blob(['{"tables":{}}'], { type: 'application/json' });
    vi.spyOn(account, 'exportData').mockResolvedValue(blob);
    const created = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(created).toHaveBeenCalledWith(blob);
    expect(clicked[0]).toMatch(/^el-quinto-ventriculo-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('«Eliminar mi cuenta» asks for the email, says until when and signs out', async () => {
    const account = acceptedAccount(EMAIL);
    const request = vi.spyOn(account, 'requestDeletion');
    const user = userEvent.setup();
    const { router } = renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    expect(dialog).toHaveTextContent(/En 7 días se borra todo lo tuyo/);
    expect(dialog).toHaveTextContent(/Si vuelves a entrar antes, se cancela/);
    const confirm = within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' });
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Para confirmar, escribe tu correo/),
      'otra@ug.uchile.cl',
    );
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByLabelText(/Para confirmar/));
    await user.type(within(dialog).getByLabelText(/Para confirmar/), ` ${EMAIL.toUpperCase()} `);
    await user.click(confirm);
    const done = await screen.findByRole('dialog', { name: 'Pediste eliminar tu cuenta' });
    expect(done).toHaveTextContent(/Tu cuenta se borrará el \d+ de \w+ de \d{4} a las \d{2}:\d{2}/);
    expect(request).toHaveBeenCalledWith(EMAIL.toUpperCase());
    await user.click(within(done).getByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(router.state.location.search).toBe('?notice=deletion'));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Tu cuenta se eliminará');
    expect(notice).toHaveTextContent(/se borrará en 7 días/);
  });

  it('while asking, the popup does not close (Revisión de cero, 2.3)', async () => {
    const account = acceptedAccount(EMAIL);
    let answer: (v: { deleteAfter: string }) => void = () => undefined;
    vi.spyOn(account, 'requestDeletion').mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    await user.type(within(dialog).getByLabelText(/Para confirmar/), EMAIL);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await within(dialog).findByRole('button', { name: 'Pidiendo…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Eliminar mi cuenta' })).toBeInTheDocument();
    await act(async () => answer({ deleteAfter: '2026-11-15T12:00:00Z' }));
    expect(
      await screen.findByRole('dialog', { name: 'Pediste eliminar tu cuenta' }),
    ).toBeInTheDocument();
  });

  it('what the database refuses is said (an administrator)', async () => {
    const account = acceptedAccount(EMAIL);
    const { AccountError } = await import('./repository');
    vi.spyOn(account, 'requestDeletion').mockRejectedValue(
      new AccountError(
        'admin_account',
        'Eres administrador del sitio: para eliminar tu cuenta, primero hay que sacarte de los administradores.',
      ),
    );
    const user = userEvent.setup();
    renderApp('/settings/account', { account });
    await user.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar mi cuenta' });
    await user.type(within(dialog).getByLabelText(/Para confirmar/), EMAIL);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /Eres administrador del sitio/,
    );
  });
});

describe('the database’s refusals', () => {
  it('turn into what the web says', async () => {
    const { accountError } = await import('./repository');
    expect(accountError({ message: 'email_mismatch' }).code).toBe('email_mismatch');
    expect(accountError({ message: 'session_closed' }).message).toMatch(/Tu sesión se cerró/);
    expect(accountError({ message: 'admin_account' }).code).toBe('admin_account');
    expect(accountError(new Error('fetch failed')).code).toBe('unknown');
  });
});

describe('the repository of the users’ database', () => {
  it('enters with the versions of this bundle (a Worker rolled back does not ask again)', async () => {
    const { supabaseAccountRepository } = await import('./repository');
    const rpc = vi.fn(async () => ({
      data: {
        accepted: { terms_version: '1', privacy_version: '1', accepted_at: '2026-11-08T12:00:00Z' },
        deletion_cancelled: false,
      },
      error: null,
    }));
    const client = { rpc } as unknown as Parameters<typeof supabaseAccountRepository>[0];
    const repo = supabaseAccountRepository(client, { url: 'https://x.supabase.co', key: 'k' });
    expect(
      await repo.resume({
        terms: LEGAL_VERSIONS.terms.version,
        privacy: LEGAL_VERSIONS.privacy.version,
      }),
    ).toEqual({
      accepted: { terms: '1', privacy: '1', acceptedAt: '2026-11-08T12:00:00Z' },
      deletionCancelled: false,
    });
    expect(rpc).toHaveBeenCalledWith('resume_account', {
      terms_version: LEGAL_VERSIONS.terms.version,
      privacy_version: LEGAL_VERSIONS.privacy.version,
    });
  });
});
