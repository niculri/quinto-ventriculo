// renderApp(): the whole site with the real routes, the test fixtures and fake services.
import { render } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { Providers } from '../app/Providers';
import { WRITE_DEFAULTS } from '../app/queryClient';
import { routes } from '../app/routes';
import { localNewsRepository } from '../features/news/api/repository';
import type { NewsRepository } from '../features/news/api/repository';
import type { Services } from '../app/ServicesProvider';
import type { AccountRepository } from '../features/account/api/repository';
import { localAdminRepository } from '../features/admin/api/repository';
import type { AdminRepository } from '../features/admin/api/repository';
import type { StudyRepository } from '../features/progress/api/repository';
import { localQuizRepository } from '../features/quiz/api/repository';
import type { QuizRepository } from '../features/quiz/api/repository';
import { localReportsRepository } from '../features/reports/api/repository';
import type { ReportsRepository } from '../features/reports/api/repository';
import type { GoogleIdentityLoader } from '../features/session/api/googleIdentity';
import type { Session } from '../features/session/api/service';
import type { ApiClient } from '../shared/lib/api';
import { fakeApi } from './fakes/api';
import { acceptedAccount, fullAnkiStudy } from './fakes/repositories';
import { fakeSession } from './fakes/session';
import { SESSION_ANA } from './fixtures/session';

export function renderApp(
  route: string | { pathname: string; state: unknown },
  op: {
    session?: Session | null;
    api?: ApiClient;
    study?: StudyRepository;
    quiz?: QuizRepository;
    admin?: AdminRepository;
    reports?: ReportsRepository;
    account?: AccountRepository;
    news?: NewsRepository;
    adminApi?: ApiClient;
    google?: GoogleIdentityLoader;
    /** Instead of one that never retries. */
    queryClient?: QueryClient;
  } = {},
) {
  const session = fakeSession(op.session === undefined ? SESSION_ANA : op.session);
  const services: Services = {
    session,
    api: op.api ?? fakeApi(),
    study: op.study ?? fullAnkiStudy(),
    quiz: op.quiz ?? localQuizRepository(null),
    admin: op.admin ?? localAdminRepository(),
    reports: op.reports ?? localReportsRepository({ admin: true }),
    account: op.account ?? acceptedAccount(),
    news: op.news ?? localNewsRepository(),
    ...(op.adminApi ? { adminApi: op.adminApi } : {}),
    ...(op.google ? { google: op.google } : {}),
  };
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const r = render(
    <Providers
      services={services}
      queryClient={
        op.queryClient ??
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: WRITE_DEFAULTS },
        })
      }
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...r, router, session };
}
