// Return from Google: waits while Supabase creates the session, then goes on to the saved destination or the notice.
import { useEffect } from 'react';
import { paths } from '../../shared/lib/paths';
import { Navigate, useLocation } from 'react-router';
import { Loading } from '../../shared/ui/Loading';
import { noticeCodeForError } from './notices';
import { useSession } from './context';
import { NEXT_KEY } from './api/service';

// Internal routes only (no open redirects); the browser strips tabs and newlines, so «/\t/x.site» would be «//x.site».
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
  if (state.status === 'signed-out') return <Navigate to={paths.landing()} replace />;
  let next: string | null = null;
  try {
    next = sessionStorage.getItem(NEXT_KEY);
  } catch {
    // nothing
  }
  return <Navigate to={safeDestination(next)} replace />;
}
