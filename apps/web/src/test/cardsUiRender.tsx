// renderWithServices(): one piece of the cards page inside the site's providers and a router, with fake services.
import { localNewsRepository } from '../features/news/api/repository';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Providers } from '../app/Providers';
import { WRITE_DEFAULTS } from '../app/queryClient';
import { localAdminRepository } from '../features/admin/api/repository';
import type { StudyRepository } from '../features/progress/api/repository';
import { localQuizRepository } from '../features/quiz/api/repository';
import { localReportsRepository } from '../features/reports/api/repository';
import type { ReportsRepository } from '../features/reports/api/repository';
import type { ApiClient } from '../shared/lib/api';
import { fakeApi } from './fakes/api';
import { acceptedAccount, fullAnkiStudy } from './fakes/repositories';
import { fakeSession } from './fakes/session';
import { SESSION_ANA } from './fixtures/session';

export function renderWithServices(
  ui: ReactNode,
  op: {
    api?: ApiClient;
    study?: StudyRepository;
    reports?: ReportsRepository;
    route?: string;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: WRITE_DEFAULTS },
  });
  return render(
    <Providers
      services={{
        session: fakeSession(SESSION_ANA),
        api: op.api ?? fakeApi(),
        study: op.study ?? fullAnkiStudy(),
        quiz: localQuizRepository(null),
        admin: localAdminRepository(),
        reports: op.reports ?? localReportsRepository({ admin: true }),
        account: acceptedAccount(),
        news: localNewsRepository(),
      }}
      queryClient={client}
    >
      <MemoryRouter initialEntries={[op.route ?? '/']}>{ui}</MemoryRouter>
    </Providers>,
  );
}
