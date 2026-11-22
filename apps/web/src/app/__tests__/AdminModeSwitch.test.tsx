// Tests the switch of the admin mode by itself: entering needs the admin API, leaving gives the student's cache back
// only what it shares and lacks, and who leaves the mode because they are not an administrator.
import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminMode } from '../../features/adminMode/adminMode';
import { localAdminRepository } from '../../features/admin/api/repository';
import type { AdminRepository } from '../../features/admin/api/repository';
import { localQuizRepository } from '../../features/quiz/api/repository';
import { localReportsRepository } from '../../features/reports/api/repository';
import type { Session } from '../../features/session/api/service';
import { studyKeys } from '../../features/progress/queries';
import { fakeApi } from '../../test/fakes/api';
import { acceptedAccount, fullAnkiStudy } from '../../test/fakes/repositories';
import { fakeSession } from '../../test/fakes/session';
import { SESSION_ANA } from '../../test/fixtures/session';
import { AdminModeSwitch } from '../AdminModeSwitch';
import type { Services } from '../ServicesProvider';

afterEach(() => window.localStorage.clear());

function Switch() {
  const mode = useAdminMode();
  return (
    <>
      <button type="button" onClick={() => mode.set(true)}>
        enter
      </button>
      <button type="button" onClick={() => mode.set(false)}>
        exit
      </button>
    </>
  );
}

function services(over: Partial<Services> = {}): Services {
  return {
    session: fakeSession(SESSION_ANA),
    api: fakeApi(),
    adminApi: fakeApi(),
    study: fullAnkiStudy(),
    quiz: localQuizRepository(null),
    admin: localAdminRepository({ admin: true }),
    reports: localReportsRepository({ admin: true }),
    account: acceptedAccount(),
    ...over,
  };
}

function mount(s: Services, client = new QueryClient(), adminClient = new QueryClient()) {
  return render(
    <AdminModeSwitch
      services={s}
      client={client}
      adminClient={adminClient}
      render={(parts) => (
        <>
          <p>
            {parts.site} · {parts.client === adminClient ? 'admin cache' : 'student cache'}
          </p>
          <Switch />
        </>
      )}
    />,
  );
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('entering and leaving', () => {
  it('without the admin API, entering does nothing and the browser does not remember it', async () => {
    const { adminApi: _none, ...rest } = services();
    mount(rest);
    await userEvent.click(screen.getByRole('button', { name: 'enter' }));
    expect(screen.getByText('student · student cache')).toBeInTheDocument();
    expect(window.localStorage.getItem('qv-admin-mode')).toBeNull();
  });

  it('leaving gives back what is shared and the student lacks, always the release, never the rest', async () => {
    const client = new QueryClient();
    const adminClient = new QueryClient();
    client.setQueryData(studyKeys.preferences, { mine: 'student' });
    client.setQueryData(['release', 'r1'], 'old');
    client.getQueryCache().build(client, { queryKey: ['report-queue'] });
    mount(services(), client, adminClient);
    await userEvent.click(screen.getByRole('button', { name: 'enter' }));
    expect(screen.getByText('admin · admin cache')).toBeInTheDocument();
    expect(adminClient.getQueryData(studyKeys.preferences)).toEqual({ mine: 'student' });
    expect(adminClient.getQueryCache().find({ queryKey: ['report-queue'] })).toBeUndefined();
    adminClient.setQueryData(studyKeys.preferences, { mine: 'admin' });
    adminClient.setQueryData(['release', 'r1'], 'new');
    adminClient.setQueryData(['is-admin'], true);
    adminClient.setQueryData(['deck', 'd1'], 'draft');
    adminClient.getQueryCache().build(adminClient, { queryKey: ['access-report'] });
    await userEvent.click(screen.getByRole('button', { name: 'exit' }));
    expect(screen.getByText('student · student cache')).toBeInTheDocument();
    expect(client.getQueryData(studyKeys.preferences)).toEqual({ mine: 'student' });
    expect(client.getQueryData(['release', 'r1'])).toBe('new');
    expect(client.getQueryData(['is-admin'])).toBe(true);
    expect(client.getQueryData(['deck', 'd1'])).toBeUndefined();
    expect(client.getQueryCache().find({ queryKey: ['access-report'] })).toBeUndefined();
    expect(adminClient.getQueryCache().getAll()).toEqual([]);
    expect(window.localStorage.getItem('qv-admin-mode')).toBe('student');
  });
});

describe('a browser left in the admin mode', () => {
  const remembered = () => window.localStorage.setItem('qv-admin-mode', 'admin');

  it('signed out, the mode is only remembered: nobody is asked', async () => {
    remembered();
    const admin = localAdminRepository({ admin: false });
    const isAdmin = vi.spyOn(admin, 'isAdmin');
    mount(services({ session: fakeSession(null), admin }));
    await flush();
    expect(screen.getByText('admin · admin cache')).toBeInTheDocument();
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it('a failed check is not a «no»: the mode stays', async () => {
    remembered();
    const admin: AdminRepository = {
      ...localAdminRepository({ admin: true }),
      isAdmin: () => Promise.reject(new Error('offline')),
    };
    mount(services({ admin }));
    await flush();
    expect(screen.getByText('admin · admin cache')).toBeInTheDocument();
  });

  it('somebody who is not an administrator signing in later leaves it', async () => {
    remembered();
    const session = fakeSession(null);
    let current: Session | null = null;
    const listeners: ((s: Session | null) => void)[] = [];
    mount(
      services({
        session: {
          ...session,
          current: async () => current,
          subscribe: (f) => {
            listeners.push(f);
            return () => undefined;
          },
        },
        admin: localAdminRepository({ admin: false }),
      }),
    );
    await flush();
    expect(screen.getByText('admin · admin cache')).toBeInTheDocument();
    current = SESSION_ANA;
    await act(async () => listeners.forEach((f) => f(SESSION_ANA)));
    await flush();
    expect(screen.getByText('student · student cache')).toBeInTheDocument();
  });

  it('an answer that arrives after the page left changes nothing', async () => {
    remembered();
    let answer: (yes: boolean) => void = () => undefined;
    const admin: AdminRepository = {
      ...localAdminRepository({ admin: true }),
      isAdmin: () => new Promise((r) => (answer = r)),
    };
    const { unmount } = mount(services({ admin }));
    await flush();
    unmount();
    answer(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(window.localStorage.getItem('qv-admin-mode')).toBe('admin');
  });
});
