// The web's external dependencies (session, API, repositories), for the demo or for Supabase; components ask for
// them with useServices(), and tests swap them.
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { PREVIEW_HEADERS, createApiClient } from '../lib/api';
import type { ApiClient } from '../lib/api';
import { localStudyRepository, supabaseStudyRepository } from '../features/study/repository';
import type { StudyRepository } from '../features/study/repository';
import { withCardSync } from '../features/study/sync';
import { withDemoHistory } from '../features/stats/demo';
import { withDemoCards } from '../features/cards/demo';
import { localQuizRepository, supabaseQuizRepository } from '../features/quiz/repository';
import type { QuizRepository } from '../features/quiz/repository';
import { localAdminRepository, supabaseAdminRepository } from '../features/admin/repository';
import type { AdminRepository } from '../features/admin/repository';
import { localAccountRepository, supabaseAccountRepository } from '../features/account/repository';
import { localReportsRepository, supabaseReportsRepository } from '../features/reports/repository';
import type { ReportsRepository } from '../features/reports/repository';
import type { AccountRepository } from '../features/account/repository';
import { DEMO_EMAIL, demoSessionService } from '../features/session/demo';
import { supabaseSessionService } from '../features/session/service';
import type { SessionService } from '../features/session/service';

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
    return window.localStorage.getItem('qv-demo-role');
  } catch {
    return null;
  }
}

function demoData() {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith('qv-demo-') || key === 'qv-demo-session') continue;
    try {
      data[key] = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    } catch {
      data[key] = window.localStorage.getItem(key);
    }
  }
  return data;
}

const userOf = (session: SessionService) => async () => (await session.current())?.user.id ?? null;

const Context = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <Context value={services}>{children}</Context>;
}

export function useServices(): Services {
  const s = useContext(Context);
  if (!s) throw new Error('useServices outside <ServicesProvider>');
  return s;
}
