// Route guard: without a session, back to the landing page remembering the destination; with one, through AccountGate.
import { Navigate, useLocation } from 'react-router';
import { paths } from '../shared/lib/paths';
import { Loading } from '../shared/ui/Loading';
import { AppShell } from './AppShell';
import { AccountGate } from './AccountGate';
import { useSession } from '../features/session/context';

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
