// Tests where the legal pages are drawn: in the app's frame for a session that accepted the terms, as public pages
// without a session or before accepting (the popup «Antes de entrar» links to them).
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { localAccountRepository } from '../../features/account/api/repository';
import { SESSION_ANA } from '../../test/fixtures/session';
import { renderApp } from '../../test/render';

const TITLE = { level: 1, name: 'Política de privacidad' } as const;

describe('the legal pages', () => {
  it('with a session that accepted, in the app’s frame: the site’s menu and «Inicio › Política de privacidad»', async () => {
    renderApp('/privacy');
    const main = await screen.findByRole('main');
    await within(main).findByRole('heading', TITLE);
    expect(within(main).getByRole('navigation', { name: 'Ruta' })).toHaveTextContent(
      'InicioPolítica de privacidad',
    );
    expect(screen.getByRole('button', { name: /tu cuenta$/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'El Quinto Ventrículo, portada' })).toBeNull();
  });

  it('without a session, the public page with the logo to the landing page', async () => {
    renderApp('/terms', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos de uso' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'El Quinto Ventrículo, portada' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('navigation', { name: 'Ruta' })).toBeNull();
  });

  it('before accepting, the public page too, and no popup asks for the acceptance', async () => {
    renderApp('/privacy', { account: localAccountRepository({ email: SESSION_ANA.user.email }) });
    expect(await screen.findByRole('heading', TITLE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Ruta' })).toBeNull();
  });
});
