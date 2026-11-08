import { Navigate, useLocation } from 'react-router';
import { paths } from '../../app/paths';
import { Loading } from '../../ui/Loading';
import { AppShell } from '../../ui/AppShell';
import { AccountGate } from '../account/AccountGate';
import { useSession } from './context';

/**
 * Everything but the landing page (and /privacy and /terms) requires a session. Without one, back to the landing page,
 * remembering where it was going. With one, the terms and the privacy policy in force accepted (AccountGate).
 */
export function ProtectedRoute() {
  const { state } = useSession();
  const location = useLocation();
  if (state.status === 'loading') return <Loading fullScreen />;
  if (state.status === 'signed-out') {
    const destination = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={paths.landing({ next: destination })} replace />;
  }
  return (
    <AccountGate>
      <AppShell />
    </AccountGate>
  );
}
