// Tests the gate on entering: an account state that could not be read says so, and «Reintentar» reads it again.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { acceptedAccount } from '../../test/fakes/repositories';
import { renderApp } from '../../test/render';

describe('the account gate', () => {
  it('a failed read of the account shows its error, and «Reintentar» lets in once it is read', async () => {
    const account = acceptedAccount();
    const resume = account.resume.bind(account);
    let down = true;
    vi.spyOn(account, 'resume').mockImplementation(async (versions) => {
      if (down) throw new Error('Sin conexión con la base.');
      return resume(versions);
    });
    renderApp('/home', { account });
    expect(await screen.findByText('No se pudo entrar')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión con la base.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hola, Ana' })).toBeNull();
    down = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
  });
});
