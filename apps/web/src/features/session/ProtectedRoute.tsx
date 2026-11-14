// Route guard: without a session, back to the landing page remembering the destination; with one, through AccountGate.
import { Navigate, useLocation } from 'react-router';
import { paths } from '../../app/paths';
import { Loading } from '../../ui/Loading';
import { AppShell } from '../../ui/AppShell';
import { AccountGate } from '../account/AccountGate';
import { useSession } from './context';

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
