// Tests the providers around the site: without a QueryClient of its own, the site's is used (a 404 is not retried).
import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { localAdminRepository } from '../../features/admin/api/repository';
import { localQuizRepository } from '../../features/quiz/api/repository';
import { localReportsRepository } from '../../features/reports/api/repository';
import { ApiRequestError } from '../../shared/lib/api';
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

describe('Providers', () => {
  it('without a QueryClient given, a read that is not found fails at once, not retried', async () => {
    render(
      <Providers
        services={{
          session: fakeSession(SESSION_ANA),
          api: fakeApi(),
          study: fullAnkiStudy(),
          quiz: localQuizRepository(null),
          admin: localAdminRepository(),
          reports: localReportsRepository({ admin: true }),
          account: acceptedAccount(),
        }}
      >
        <Page />
      </Providers>,
    );
    expect(await screen.findByText('No existe.')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
