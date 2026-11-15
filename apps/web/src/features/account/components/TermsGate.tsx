// The popup that asks to accept the terms and the privacy policy in force before showing the site.
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router';
import { LEGAL_VERSIONS } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { formatDay } from '../../../shared/lib/dates';
import { button } from '../../../shared/ui/styles';
import { AccountError } from '../api/repository';
import { GateDialog } from './GateDialog';
import { gateStrings as s } from '../gate.strings';

export function TermsGate({
  changed,
  cancelled,
  error,
  saving,
  onAccept,
  onLeave,
}: {
  changed: boolean;
  cancelled: boolean;
  error: Error | null;
  saving: boolean;
  onAccept: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <GateDialog title={changed ? s.changedTitle : s.firstTitle}>
        {cancelled ? <CancelledText /> : null}
        <Dialog.Description className="text-sm leading-relaxed text-muted">
          {changed ? s.changed : s.first}
        </Dialog.Description>
        <ul className="mt-4 space-y-2 text-sm">
          <Version href={paths.terms} name={s.terms} legal={LEGAL_VERSIONS.terms} />
          <Version href={paths.privacy} name={s.privacy} legal={LEGAL_VERSIONS.privacy} />
        </ul>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-state-learn">
            {error instanceof AccountError ? error.message : s.saveFailed}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to={paths.accountSettings}
            className="text-sm text-muted underline underline-offset-2 hover:text-ink"
          >
            {s.dataOrDelete}
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={onLeave} className={`${button.base} ${button.ghost}`}>
              {s.signOut}
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={saving}
              className={`${button.base} ${button.primary}`}
            >
              {saving ? s.saving : s.accept}
            </button>
          </div>
        </div>
      </GateDialog>
    </div>
  );
}

function Version({
  href,
  name,
  legal,
}: {
  href: string;
  name: string;
  legal: { version: string; date: string };
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="font-medium text-brand underline underline-offset-2"
      >
        {name}
      </a>{' '}
      <span className="text-muted">
        {s.version}
        {legal.version}, {formatDay(legal.date)}
      </span>
    </li>
  );
}

function CancelledText() {
  return (
    <p className="mb-3 rounded-lg border border-brand/25 bg-brand-soft p-3 text-sm leading-relaxed">
      {s.cancelledLine}
    </p>
  );
}
