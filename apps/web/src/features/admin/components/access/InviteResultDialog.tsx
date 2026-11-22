// What an invitation did: who came in, who was already there and what was refused, and why.
import * as Dialog from '@radix-ui/react-dialog';
import type { InviteResult } from '../../api/repository';
import { inviteResultDialogStrings as s } from './strings/InviteResultDialog.strings';
import { accessDialogStrings } from './strings/AccessDialog.strings';
import { inviteRowStrings } from './strings/InviteRow.strings';
import { AccessDialog, DoneButton, Emails } from './AccessDialog';

export function InviteResultDialog({
  done,
  onClose,
}: {
  done: { list: string; result: InviteResult } | null;
  onClose: () => void;
}) {
  const r = done?.result;
  return (
    <AccessDialog open={!!done} onClose={onClose} title={s.result.title(done?.list ?? '')}>
      {r ? (
        <>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {s.result.added(r.added.length)}
            {r.already.length ? s.result.already(r.already.length) : ''}
            {r.rejected.length ? s.result.rejected(r.rejected.length) : ''}
            {s.result.end}
          </Dialog.Description>
          <div className="mt-4 space-y-3 text-sm">
            <Emails title={s.result.came} emails={r.added} />
            <Emails title={s.result.were} emails={r.already} why={s.result.wereWhy} />
            {r.rejected.length ? (
              <div>
                <p className="font-medium text-ink">
                  {s.result.refused}
                  {accessDialogStrings.open}
                  {r.rejected.length}
                  {accessDialogStrings.close}
                </p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted">
                  {r.rejected.map((x, n) => (
                    <li key={`${x.email}-${n}`}>
                      <span className="font-mono break-all">{x.email || s.result.empty}</span>
                      {inviteRowStrings.sep}
                      {s.result.reasons[x.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DoneButton onClick={onClose} />
        </>
      ) : null}
    </AccessDialog>
  );
}
