// The legal pages (/privacy, /terms, /licenses, /about): in the app's frame for a session that accepted the terms in
// force, as public pages otherwise. The popup «Antes de entrar» links to them, so they never ask for the acceptance.
import { Outlet } from 'react-router';
import { Loading } from '../shared/ui/Loading';
import { useSession } from '../features/session/context';
import { useAccount } from '../features/account/hooks/useAccount';
import { acceptedNow } from '../features/account/model/accepted';
import { LegalFrameContext } from '../features/legal/model/frame';
import { WeekMemoryProvider } from '../features/nav/components/WeekMemoryProvider';
import { AppShell } from './AppShell';

export function LegalRoute() {
  const { state } = useSession();
  if (state.status === 'loading') return <Loading fullScreen />;
  return state.status === 'signed-in' ? <SignedIn /> : <Outlet />;
}

function SignedIn() {
  const account = useAccount();
  if (account.isPending) return <Loading fullScreen />;
  if (!acceptedNow(account.data)) return <Outlet />;
  return (
    <LegalFrameContext value>
      <WeekMemoryProvider>
        <AppShell />
      </WeekMemoryProvider>
    </LegalFrameContext>
  );
}
