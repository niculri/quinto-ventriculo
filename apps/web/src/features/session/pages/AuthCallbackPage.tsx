// Return from Google: waits while Supabase creates the session, then goes on to the saved destination or the notice.
import { useEffect } from 'react';
import { paths } from '../../../shared/lib/paths';
import { Navigate, useLocation } from 'react-router';
import { Loading } from '../../../shared/ui/Loading';
import { noticeCodeForError } from '../model/notices';
import { useSession } from '../context';
import { storageKeys } from '../../../shared/lib/storage';
import { safeDestination } from '../model/destination';
import { sessionStrings } from '../strings';

export function AuthCallbackPage() {
  const { state } = useSession();
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search + hash.replace(/^#/, '&'));
  const error = params.get('error_description') ?? params.get('error');

  useEffect(() => {
    if (state.status !== 'loading') {
      try {
        sessionStorage.removeItem(storageKeys.signInNext);
      } catch {
        // nothing
      }
    }
  }, [state.status]);

  if (error) return <Navigate to={paths.landing({ notice: noticeCodeForError(error) })} replace />;
  if (state.status === 'loading') return <Loading fullScreen text={sessionStrings.entering} />;
  if (state.status === 'signed-out') return <Navigate to={paths.landing()} replace />;
  let next: string | null = null;
  try {
    next = sessionStorage.getItem(storageKeys.signInNext);
  } catch {
    // nothing
  }
  return <Navigate to={safeDestination(next)} replace />;
}
