// The sections of «Datos de usuario» under the account: the terms accepted, the user's data and the session.
import { Link } from 'react-router';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { ACCOUNT_DELETION_DAYS, LEGAL_VERSIONS } from '@qv/schema';
import type { AccountState } from '@qv/schema/user';
import { paths } from '../../../shared/lib/paths';
import { formatDateTime } from '../../../shared/lib/dates';
import { button, card } from '../../../shared/ui/styles';
import { acceptedNow } from '../model/accepted';
import { accountSectionsStrings as s } from './strings/AccountSections.strings';

export function TermsSection({ state }: { state: AccountState | undefined }) {
  return (
    <section aria-labelledby="legal-title" className={`${card} mt-6 p-5 sm:p-6`}>
      <h3 id="legal-title" className="font-semibold">
        {s.terms.title}
      </h3>
      <p className="mt-1 text-sm text-muted">
        {acceptedNow(state) && state?.accepted
          ? s.terms.accepted(
              LEGAL_VERSIONS.terms.version,
              LEGAL_VERSIONS.privacy.version,
              formatDateTime(state.accepted.acceptedAt),
            )
          : s.terms.notYet}
      </p>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link to={paths.terms} className="font-medium text-brand underline underline-offset-2">
          {s.terms.termsLink}
        </Link>
        <Link to={paths.privacy} className="font-medium text-brand underline underline-offset-2">
          {s.terms.privacyLink}
        </Link>
      </p>
    </section>
  );
}

export function DataSection({
  exporting,
  onDownload,
  onDelete,
}: {
  exporting: 'idle' | 'busy' | 'failed';
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <section aria-labelledby="data-title" className={`${card} mt-6 p-5 sm:p-6`}>
      <h3 id="data-title" className="font-semibold">
        {s.data.title}
      </h3>
      <p className="mt-1 text-sm text-muted">{s.data.text}</p>
      <button
        type="button"
        onClick={onDownload}
        disabled={exporting === 'busy'}
        className={`${button.base} ${button.secondary} mt-4`}
      >
        <Download className="size-4" aria-hidden="true" />
        {exporting === 'busy' ? s.data.preparing : s.data.download}
      </button>
      {exporting === 'failed' ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {s.data.failed}
        </p>
      ) : null}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="font-semibold">{s.data.deleteTitle}</h4>
        <p className="mt-1 text-sm text-muted">
          {s.data.deleteBefore}
          {ACCOUNT_DELETION_DAYS}
          {s.data.deleteAfter}
        </p>
        <button type="button" onClick={onDelete} className={`${button.base} ${button.danger} mt-4`}>
          <Trash2 className="size-4" aria-hidden="true" />
          {s.data.delete}
        </button>
      </div>
    </section>
  );
}

export function SessionSection({ leaving, onLeave }: { leaving: boolean; onLeave: () => void }) {
  return (
    <section aria-label={s.session.label} className={`${card} mt-6 p-5 sm:p-6`}>
      <h3 className="font-semibold">{s.session.label}</h3>
      <p className="mt-1 text-sm text-muted">{s.session.text}</p>
      <button
        type="button"
        onClick={onLeave}
        disabled={leaving}
        className={`${button.base} ${button.secondary} mt-4`}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {leaving ? s.session.leaving : s.session.signOut}
      </button>
    </section>
  );
}
