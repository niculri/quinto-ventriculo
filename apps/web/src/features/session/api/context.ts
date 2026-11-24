// The auth service the session follows and Google's button loader: app/services.tsx provides them; the tests swap them.
import { createContext, use } from 'react';
import type { GoogleIdentityLoader } from './googleIdentity';
import type { SessionService } from './service';

export const SessionServiceContext = createContext<SessionService | null>(null);

export function useSessionService(): SessionService {
  const session = use(SessionServiceContext);
  if (session === null) throw new Error('useSessionService outside <ServicesProvider>');
  return session;
}

/** Null when the build has no Google client ID: the landing page then signs in by redirect only. */
export const GoogleIdentityContext = createContext<GoogleIdentityLoader | null>(null);

export function useGoogleIdentity(): GoogleIdentityLoader | null {
  return use(GoogleIdentityContext);
}
