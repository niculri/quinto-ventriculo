// The auth service the session follows: app/services.tsx provides it; the tests swap it.
import { createContext, use } from 'react';
import type { SessionService } from './service';

export const SessionServiceContext = createContext<SessionService | null>(null);

export function useSessionService(): SessionService {
  const session = use(SessionServiceContext);
  if (session === null) throw new Error('useSessionService outside <ServicesProvider>');
  return session;
}
