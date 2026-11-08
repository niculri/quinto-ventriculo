import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { PREVIEW_HEADERS, createApiClient } from '../lib/api';
import type { ApiClient } from '../lib/api';
import { localStudyRepository, supabaseStudyRepository } from '../features/study/repository';
import type { StudyRepository } from '../features/study/repository';
import { withCardSync } from '../features/study/sync';
import { localQuizRepository, supabaseQuizRepository } from '../features/quiz/repository';
import type { QuizRepository } from '../features/quiz/repository';
import { localAdminRepository, supabaseAdminRepository } from '../features/admin/repository';
import type { AdminRepository } from '../features/admin/repository';
import { localAccountRepository, supabaseAccountRepository } from '../features/account/repository';
import type { AccountRepository } from '../features/account/repository';
import { DEMO_EMAIL, demoSessionService } from '../features/session/demo';
import { supabaseSessionService } from '../features/session/service';
import type { SessionService } from '../features/session/service';

/** The web's external dependencies. Components ask for them with useServices(); tests swap them. */
export interface Services {
  session: SessionService;
  api: ApiClient;
  study: StudyRepository;
  quiz: QuizRepository;
  admin: AdminRepository;
  /** Accepting the terms, downloading one's data and deleting the account (step 2.3). */
  account: AccountRepository;
  /**
   * The same API asking for the draft (`X-QV-Preview`), for an administrator's preview (features/preview). Absent in
   * tests that do not need it.
   */
  previewApi?: ApiClient;
}

export function createServices(): Services {
  if (import.meta.env.VITE_DEMO) {
    const session = demoSessionService();
    const token = async () => (await session.current())?.token ?? null;
    const api = createApiClient(token);
    return {
      session,
      api,
      previewApi: createApiClient(token, '', PREVIEW_HEADERS),
      study: withCardSync(localStudyRepository(), api, userOf(session)),
      quiz: localQuizRepository(),
      // The demo's user is an administrator, to see the panel; `qv-demo-role` = `student` makes it a student (the e2e
      // tests of what a student does not see).
      admin: localAdminRepository({
        admin: demoRole() !== 'student',
        storage: window.localStorage,
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
  const client = createClient(url, key, {
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

/** The demo's download: what it keeps of the demo's account in this browser. */
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
