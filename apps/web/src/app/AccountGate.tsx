// Asks to accept the terms and privacy policy in force before showing the site, and tells when entering cancelled a
// deletion.
import type { ReactNode } from 'react';
import { paths } from '../shared/lib/paths';
import { Loading } from '../shared/ui/Loading';
import { Notice } from '../shared/ui/Notice';
import { button } from '../shared/ui/styles';
import { useAccountGate } from '../features/account/hooks/useAccountGate';
import { TermsGate } from '../features/account/components/TermsGate';
import { CancelledNotice, NewVersionNotice } from '../features/account/components/GateNotices';
import { gateStrings as s } from '../features/account/gate.strings';

export function AccountGate({ children }: { children: ReactNode }) {
  const { state, accept, accepted, told, closed, staleBundle, pathname, leave } = useAccountGate();

  if (state.isPending || closed) return <Loading fullScreen />;
  if (state.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Notice title={s.failed}>
          <p>{state.error.message}</p>
          <button
            type="button"
            onClick={() => void state.refetch()}
            className={`${button.base} ${button.secondary} mt-3`}
          >
            {s.retry}
          </button>
        </Notice>
      </div>
    );
  }

  const cancelled = state.data.deletionCancelled;

  if (!accepted && pathname !== paths.accountSettings) {
    return (
      <TermsGate
        changed={state.data.accepted !== null}
        cancelled={cancelled}
        error={accept.isError ? accept.error : null}
        saving={accept.isPending}
        onAccept={() => accept.mutate()}
        onLeave={leave}
      />
    );
  }

  return (
    <>
      {children}
      {cancelled ? <CancelledNotice onTold={told} /> : null}
      {staleBundle ? <NewVersionNotice /> : null}
    </>
  );
}
