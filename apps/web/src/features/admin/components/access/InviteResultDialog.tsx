// What an invitation did: who came in, who was already there and what was refused, and why.
import * as Dialog from '@radix-ui/react-dialog';
import type { InviteResult } from '../../api/repository';
import { accessStrings } from '../../access.strings';
import { AccessDialog, DoneButton, Emails } from './AccessDialog';

const s = accessStrings.result;

export function InviteResultDialog({
  done,
  onClose,
}: {
  done: { list: string; result: InviteResult } | null;
  onClose: () => void;
}) {
  const r = done?.result;
  return (
    <AccessDialog open={!!done} onClose={onClose} title={s.title(done?.list ?? '')}>
      {r ? (
        <>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {s.added(r.added.length)}
            {r.already.length ? s.already(r.already.length) : ''}
            {r.rejected.length ? s.rejected(r.rejected.length) : ''}
            {s.end}
          </Dialog.Description>
          <div className="mt-4 space-y-3 text-sm">
            <Emails title={s.came} emails={r.added} />
            <Emails title={s.were} emails={r.already} why={s.wereWhy} />
            {r.rejected.length ? (
              <div>
                <p className="font-medium text-ink">
                  {s.refused}
                  {accessStrings.open}
                  {r.rejected.length}
                  {accessStrings.close}
                </p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted">
                  {r.rejected.map((x, n) => (
                    <li key={`${x.email}-${n}`}>
                      <span className="font-mono break-all">{x.email || s.empty}</span>
                      {accessStrings.sep}
                      {s.reasons[x.reason]}
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
