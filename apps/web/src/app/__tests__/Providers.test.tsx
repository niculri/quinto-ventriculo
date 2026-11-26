// Tests the providers around the site: without a QueryClient of its own, the site's is used (a 404 is not retried), and
// refreshing the material reads it again and forgets what the API client kept.
import { localNewsRepository } from '../../features/news/api/repository';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { localAdminRepository } from '../../features/admin/api/repository';
import { localQuizRepository } from '../../features/quiz/api/repository';
import { localReportsRepository } from '../../features/reports/api/repository';
import { useRefreshContent } from '../../shared/hooks/useRefreshContent';
import { ApiRequestError, createApiClient } from '../../shared/lib/api';
import { CONTENT_QUERY } from '../../shared/lib/contentQuery';
import { fakeApi } from '../../test/fakes/api';
import { acceptedAccount, fullAnkiStudy } from '../../test/fakes/repositories';
import { fakeSession } from '../../test/fakes/session';
import { SESSION_ANA } from '../../test/fixtures/session';
import { Providers } from '../Providers';

const read = vi.fn(async () => {
  throw new ApiRequestError(404, 'not_found', 'No existe.');
});

function Page() {
  const q = useQuery({ queryKey: ['page'], queryFn: read });
  return <p>{q.isError ? q.error.message : 'loading'}</p>;
}

const services = (api = fakeApi()) => ({
  session: fakeSession(SESSION_ANA),
  api,
  study: fullAnkiStudy(),
  quiz: localQuizRepository(null),
  admin: localAdminRepository(),
  reports: localReportsRepository({ admin: true }),
  account: acceptedAccount(),
  news: localNewsRepository(),
});

describe('Providers', () => {
  it('without a QueryClient given, a read that is not found fails at once, not retried', async () => {
    render(
      <Providers services={services()}>
        <Page />
      </Providers>,
    );
    expect(await screen.findByText('No existe.')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('refreshing the material reads it again, past what the API client kept; the rest stays', async () => {
    const material = vi.fn(async () => 'apunte');
    const progress = vi.fn(async () => 'avance');
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ query: 'x', results: [] }), {
          headers: { ETag: 'W/"v1"' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const api = createApiClient(async () => null);
    await api.search('x');
    function Refresh() {
      useQuery({ queryKey: ['note'], queryFn: material, staleTime: Infinity, meta: CONTENT_QUERY });
      useQuery({ queryKey: ['progress'], queryFn: progress, staleTime: Infinity });
      const refresh = useRefreshContent();
      return (
        <button type="button" onClick={refresh}>
          Refrescar
        </button>
      );
    }
    render(
      <Providers services={services(api)} queryClient={new QueryClient()}>
        <Refresh />
      </Providers>,
    );
    await waitFor(() => expect(material).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    await waitFor(() => expect(material).toHaveBeenCalledTimes(2));
    expect(progress).toHaveBeenCalledOnce();
    await api.search('x');
    expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ cache: 'reload' });
    vi.unstubAllGlobals();
  });
});
