// The web's external dependencies (session, API, repositories), for the demo or for Supabase, composed and provided:
// each feature reads its own with its hook (useStudyRepository(), useApi()…), and tests swap them.
import type { ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { PREVIEW_HEADERS, createApiClient } from '../shared/lib/api';
import type { ApiClient } from '../shared/lib/api';
import { localStudyRepository, supabaseStudyRepository } from '../features/progress/api/repository';
import type { StudyRepository } from '../features/progress/api/repository';
import { withCardSync } from '../features/progress/api/sync';
import { withDemoHistory } from '../features/stats/demo';
import { withDemoCards } from '../features/cards/demo';
import { localQuizRepository, supabaseQuizRepository } from '../features/quiz/api/repository';
import type { QuizRepository } from '../features/quiz/api/repository';
import { localAdminRepository, supabaseAdminRepository } from '../features/admin/api/repository';
import type { AdminRepository } from '../features/admin/api/repository';
import {
  localAccountRepository,
  supabaseAccountRepository,
} from '../features/account/api/repository';
import {
  localReportsRepository,
  supabaseReportsRepository,
} from '../features/reports/api/repository';
import type { ReportsRepository } from '../features/reports/api/repository';
import type { AccountRepository } from '../features/account/api/repository';
import { DEMO_EMAIL, demoSessionService } from '../features/session/api/demo';
import { supabaseSessionService } from '../features/session/api/service';
import type { SessionService } from '../features/session/api/service';
import { SessionServiceContext } from '../features/session/api/context';
import { ApiClientContext } from '../shared/hooks/useApi';
import { StudyRepositoryContext } from '../features/progress/api/context';
import { QuizRepositoryContext } from '../features/quiz/api/context';
import { AdminRepositoryContext } from '../features/admin/api/context';
import { ReportsRepositoryContext } from '../features/reports/api/context';
import { AccountRepositoryContext } from '../features/account/api/context';
import { storageKeys } from '../shared/lib/storage';

export interface Services {
  session: SessionService;
  api: ApiClient;
  study: StudyRepository;
  quiz: QuizRepository;
  admin: AdminRepository;
  reports: ReportsRepository;
  account: AccountRepository;
  previewApi?: ApiClient;
}

export function createServices(): Services {
  if (import.meta.env.VITE_DEMO) {
    const session = demoSessionService();
    const token = async () => (await session.current())?.token ?? null;
    const demo = withDemoCards(
      createApiClient(token),
      withCardSync(localStudyRepository(), createApiClient(token), userOf(session)),
    );
    const api = demo.api;
    return {
      session,
      api,
      previewApi: createApiClient(token, '', PREVIEW_HEADERS),
      study: withDemoHistory(demo.study, () => api.catalog()),
      quiz: localQuizRepository(),
      // The demo's user is the site owner, to see the whole panel; `qv-demo-role` = `student` makes it a student, and
      // `admin` an administrator who is not the site owner (for the e2e tests of what they do not see).
      admin: localAdminRepository({
        admin: demoRole() !== 'student',
        owner: demoRole() !== 'admin',
        storage: window.localStorage,
        email: DEMO_EMAIL,
      }),
      reports: localReportsRepository({
        storage: window.localStorage,
        admin: demoRole() !== 'student',
        email: DEMO_EMAIL,
      }),
      account: localAccountRepository({
        storage: window.localStorage,
        email: DEMO_EMAIL,
        exported: demoData,
      }),
    };
  }
  const url = import.meta.env.VITE_USERS_SUPABASE_URL;
  const key = import.meta.env.VITE_USERS_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan VITE_USERS_SUPABASE_URL y VITE_USERS_SUPABASE_PUBLISHABLE_KEY.');
  }
  const client = createClient<Database>(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  const session = supabaseSessionService(client);
  const token = async () => (await session.current())?.token ?? null;
  const api = createApiClient(token);
  return {
    session,
    api,
    previewApi: createApiClient(token, '', PREVIEW_HEADERS),
    // Before reading their progress, the student's cards follow what the author moved or took out.
    study: withCardSync(supabaseStudyRepository(client), api, userOf(session)),
    quiz: supabaseQuizRepository(client),
    admin: supabaseAdminRepository(client),
    reports: supabaseReportsRepository(client),
    account: supabaseAccountRepository(client, { url, key }),
  };
}

function demoRole(): string | null {
  try {
    return window.localStorage.getItem(storageKeys.demo.role);
  } catch {
    return null;
  }
}

function demoData() {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(storageKeys.demo.prefix) || key === storageKeys.demo.session) continue;
    try {
      data[key] = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    } catch {
      data[key] = window.localStorage.getItem(key);
    }
  }
  return data;
}

const userOf = (session: SessionService) => async () => (await session.current())?.user.id ?? null;

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return (
    <SessionServiceContext value={services.session}>
      <ApiClientContext value={services.api}>
        <StudyRepositoryContext value={services.study}>
          <QuizRepositoryContext value={services.quiz}>
            <AdminRepositoryContext value={services.admin}>
              <ReportsRepositoryContext value={services.reports}>
                <AccountRepositoryContext value={services.account}>
                  {children}
                </AccountRepositoryContext>
              </ReportsRepositoryContext>
            </AdminRepositoryContext>
          </QuizRepositoryContext>
        </StudyRepositoryContext>
      </ApiClientContext>
    </SessionServiceContext>
  );
}
