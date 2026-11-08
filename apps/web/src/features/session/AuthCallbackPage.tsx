import { useEffect } from 'react';
import { paths } from '../../app/paths';
import { Navigate, useLocation } from 'react-router';
import { Loading } from '../../ui/Loading';
import { noticeCodeForError } from './notices';
import { useSession } from './context';
import { NEXT_KEY } from './service';

/**
 * Internal routes only, never another site (avoids open redirects). No backslashes or control characters:
 * the browser strips the tab and the newline from a URL, and «/\t/other.site» becomes «//other.site».
 */
export function safeDestination(destination: string | null | undefined): string {
  if (
    !destination ||
    !destination.startsWith('/') ||
    destination.startsWith('//') ||
    destination.includes('\\') ||
    [...destination].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  ) {
    return paths.home;
  }
  return destination;
}

/**
 * Return from Google. Supabase reads the code from the URL and creates the session; here we only wait and
 * move on. If Supabase rejected the account (another domain), the error comes in the URL and the landing page
 * shows the notice.
 */
export function AuthCallbackPage() {
  const { state } = useSession();
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search + hash.replace(/^#/, '&'));
  const error = params.get('error_description') ?? params.get('error');

  useEffect(() => {
    if (state.status !== 'loading') {
      try {
        sessionStorage.removeItem(NEXT_KEY);
      } catch {
        // nothing
      }
    }
  }, [state.status]);

  if (error) return <Navigate to={paths.landing({ notice: noticeCodeForError(error) })} replace />;
  if (state.status === 'loading') return <Loading fullScreen text="Entrando…" />;
  // Without a session, the landing page shows whatever notice the session left (e.g., another domain).
  if (state.status === 'signed-out') return <Navigate to={paths.landing()} replace />;
  let next: string | null = null;
  try {
    next = sessionStorage.getItem(NEXT_KEY);
  } catch {
    // nothing
  }
  return <Navigate to={safeDestination(next)} replace />;
}
