// «Opciones» → «Datos de usuario»: the account as Google gives it, the terms accepted, download, deletion and sign-out.
import { useState } from 'react';
import { useTitle } from '../../../shared/hooks/useTitle';
import { useUser } from '../../session/context';
import { SettingsLayout } from '../../settings/components/SettingsLayout';
import { useAccount } from '../hooks/useAccount';
import { useDataExport } from '../hooks/useDataExport';
import { useLeave } from '../hooks/useLeave';
import { AccountCard } from '../components/AccountCard';
import { DataSection, SessionSection, TermsSection } from '../components/AccountSections';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { accountStrings as s } from '../strings';

export function AccountSettingsPage() {
  const user = useUser();
  const { leaving, leave } = useLeave();
  const state = useAccount();
  const { exporting, download } = useDataExport();
  const [deleting, setDeleting] = useState(false);

  useTitle(s.title);

  return (
    <SettingsLayout>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">{s.title}</h2>
      <p className="mt-1 text-sm text-muted">{s.intro}</p>
      <AccountCard user={user} />
      <TermsSection state={state.data} />
      <DataSection
        exporting={exporting}
        onDownload={() => void download()}
        onDelete={() => setDeleting(true)}
      />
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
      <SessionSection leaving={leaving} onLeave={() => void leave()} />
    </SettingsLayout>
  );
}
