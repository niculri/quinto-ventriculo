// Naming or removing an administrator: what it means, the email written to confirm, and then what changed.
import { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ShieldCheck, ShieldMinus } from 'lucide-react';
import { Reserved } from '../../../../shared/ui/Reserved';
import { button } from '../../../../shared/ui/styles';
import { normalizeEmail } from '../../api/repository';
import type { SetAdminResult } from '../../api/repository';
import { useSetAdmin } from '../../hooks/useAccess';
import { accessFailure } from '../../hooks/accessFailure';
import type { Appointing } from '../../model/access';
import { adminDialogStrings as s } from './strings/AdminDialog.strings';
import { accessDialogStrings } from './strings/AccessDialog.strings';
import { AccessDialog, DoneButton } from './AccessDialog';

export function AdminDialog({ target: t, onClose }: { target: Appointing; onClose: () => void }) {
  const id = useId();
  const setAdmin = useSetAdmin();
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<SetAdminResult | null>(null);
  const matches = normalizeEmail(typed) === normalizeEmail(t.email);
  const busy = setAdmin.isPending;
  const action = s.admin.action(t.admin);
  return (
    <AccessDialog
      open
      onClose={onClose}
      busy={busy}
      title={done ? s.admin.done : s.admin.title(action, t.email)}
    >
      {done ? (
        <AdminDone done={done} onClose={onClose} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches || busy) return;
            setAdmin.mutate({ email: t.email, admin: t.admin }, { onSuccess: setDone });
          }}
        >
          <Dialog.Description asChild>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {(t.admin ? s.admin.appointRules : s.admin.unappointRules).map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Dialog.Description>
          <label htmlFor={`${id}-confirm`} className="mt-5 block text-sm font-medium">
            {s.admin.confirm}
            <span className="font-mono break-all">{t.email}</span>
            {accessDialogStrings.close}
          </label>
          <input
            id={`${id}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:text-sm"
          />
          <Reserved longest={s.admin.longestRefusal} className="mt-2 text-sm">
            {setAdmin.isError ? (
              <p role="alert" className="text-state-learn">
                {accessFailure(setAdmin.error)}
              </p>
            ) : null}
          </Reserved>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`${button.base} ${button.secondary}`}
            >
              {s.admin.cancel}
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              className={`${button.base} ${t.admin ? button.primary : button.danger}`}
            >
              {t.admin ? (
                <ShieldCheck className="size-4" aria-hidden="true" />
              ) : (
                <ShieldMinus className="size-4" aria-hidden="true" />
              )}
              <span className="grid place-items-center">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {action}
                </span>
                <span className="col-start-1 row-start-1">{busy ? s.admin.saving : action}</span>
              </span>
            </button>
          </div>
        </form>
      )}
    </AccessDialog>
  );
}

function AdminDone({ done, onClose }: { done: SetAdminResult; onClose: () => void }) {
  return (
    <>
      <Dialog.Description className="mt-2 text-sm break-words text-muted">
        <span className="font-mono break-all">{done.email}</span>{' '}
        {done.admin
          ? done.changed
            ? s.admin.isNow
            : s.admin.was
          : done.changed
            ? s.admin.isNoMore
            : s.admin.wasNot}
      </Dialog.Description>
      <DoneButton onClick={onClose} />
    </>
  );
}
