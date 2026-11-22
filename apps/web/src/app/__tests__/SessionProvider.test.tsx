// Tests how the page's session follows the auth service: a failed read is signed out, an account outside the domain
// is signed out with its notice (which a later sign-out keeps), and nothing happens after the page left.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionServiceContext } from '../../features/session/api/context';
import type { Session, SessionService } from '../../features/session/api/service';
import { useSession } from '../../features/session/context';
import { DOMAIN_NOTICE } from '../../features/session/model/notices';
import { fakeSession } from '../../test/fakes/session';
import { SESSION_ANA } from '../../test/fixtures/session';
import { SessionProvider } from '../SessionProvider';

function Show() {
  const session = useSession();
  const { state } = session;
  return (
    <>
      <p>
        {state.status}
        {state.status === 'signed-out' && state.notice ? ` · ${state.notice}` : ''}
      </p>
      <button type="button" onClick={() => void session.signIn()}>
        in
      </button>
      <button type="button" onClick={() => void session.signOut()}>
        out
      </button>
    </>
  );
}

function mount(service: SessionService, client = new QueryClient()) {
  return render(
    <SessionServiceContext value={service}>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <Show />
        </SessionProvider>
      </QueryClientProvider>
    </SessionServiceContext>,
  );
}

const OUTSIDE: Session = { ...SESSION_ANA, user: { ...SESSION_ANA.user, email: 'ana@gmail.com' } };

describe('SessionProvider', () => {
  it('a session that cannot be read is signed out, without a notice', async () => {
    mount({ ...fakeSession(null), current: () => Promise.reject(new Error('offline')) });
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
  });

  it('an account outside the domain is signed out with its notice, which the sign-out after keeps', async () => {
    const service = fakeSession(OUTSIDE);
    const signOut = vi.spyOn(service, 'signOut');
    mount(service);
    expect(await screen.findByText(`signed-out · ${DOMAIN_NOTICE}`)).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledTimes(1);
    await service.signOut();
    expect(await screen.findByText(`signed-out · ${DOMAIN_NOTICE}`)).toBeInTheDocument();
  });

  it('signing in goes home by default; signing out also empties the cached reads', async () => {
    const user = userEvent.setup();
    const service = fakeSession(SESSION_ANA);
    const client = new QueryClient();
    client.setQueryData(['x'], 1);
    mount(service, client);
    expect(await screen.findByText('signed-in')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'in' }));
    expect(service.signIns).toEqual(['/home']);
    await user.click(screen.getByRole('button', { name: 'out' }));
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(client.getQueryData(['x'])).toBeUndefined();
  });

  it('a session that arrives after the page left signs nobody out', async () => {
    let arrive: (s: Session) => void = () => undefined;
    const service = fakeSession(null);
    const signOut = vi.spyOn(service, 'signOut');
    const { unmount } = mount({
      ...service,
      current: () => new Promise<Session>((r) => (arrive = r)),
    });
    unmount();
    arrive(OUTSIDE);
    await new Promise((r) => setTimeout(r, 0));
    expect(signOut).not.toHaveBeenCalled();
  });
});
