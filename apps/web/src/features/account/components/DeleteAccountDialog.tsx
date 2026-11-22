// «Eliminar mi cuenta»: confirms with the account's email, says when it will be deleted and signs out.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { formatDateTime } from '../../../shared/lib/dates';
import { button } from '../../../shared/ui/styles';
import { BlurredBackdrop, CloseX } from '../../../shared/ui/Dialog';
import { useSession, useUser } from '../../session/context';
import { useAccountRepository } from '../api/context';
import { AccountError } from '../api/repository';
import { deleteAccountDialogStrings as s } from './strings/DeleteAccountDialog.strings';

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useAccountRepository();
  const user = useUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const matches = email.trim().toLowerCase() === user.email.toLowerCase();
  const request = useMutation({ mutationFn: () => account.requestDeletion(email.trim()) });
  const done = request.data ?? null;

  const leave = async () => {
    await signOut().catch(() => undefined);
    queryClient.clear();
    void navigate(paths.landing({ notice: 'deletion' }), { replace: true });
  };
  // While asking, the popup does not close: closing it then would mark the account without the person reading it.
  const busy = request.isPending;
  const close = () => {
    if (done) return void leave();
    if (busy) return;
    setEmail('');
    request.reset();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : close())}>
      <Dialog.Portal>
        <BlurredBackdrop />
        <Dialog.Content
          {...(done || busy
            ? {
                onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
                onPointerDownOutside: (e: Event) => e.preventDefault(),
              }
            : {})}
          className="fixed top-[12vh] left-1/2 z-50 max-h-[80dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
        >
          {done ? (
            <Requested deleteAfter={done.deleteAfter} onLeave={() => void leave()} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <Dialog.Title className="font-serif text-xl font-semibold">
                  {s.deletion.title}
                </Dialog.Title>
                <CloseX disabled={busy} />
              </div>
              <WhatHappens />
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (matches && !request.isPending) request.mutate();
                }}
              >
                <ConfirmEmail email={email} setEmail={setEmail} account={user.email} />
                {request.isError ? (
                  <p role="alert" className="mt-2 text-sm text-state-learn">
                    {request.error instanceof AccountError
                      ? request.error.message
                      : s.deletion.failed}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    className={`${button.base} ${button.secondary}`}
                  >
                    {s.deletion.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={!matches || request.isPending}
                    className={`${button.base} ${button.danger}`}
                  >
                    {request.isPending ? s.deletion.asking : s.deletion.delete}
                  </button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WhatHappens() {
  return (
    <Dialog.Description asChild>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        <li>{s.deletion.sessions}</li>
        <li>
          {s.deletion.inDays}
          {ACCOUNT_DELETION_DAYS}
          {s.deletion.days}
        </li>
        <li>{s.deletion.before}</li>
        <li>{s.deletion.after}</li>
      </ul>
    </Dialog.Description>
  );
}

function Requested({ deleteAfter, onLeave }: { deleteAfter: string; onLeave: () => void }) {
  return (
    <>
      <Dialog.Title className="font-serif text-xl font-semibold">
        {s.deletion.doneTitle}
      </Dialog.Title>
      <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
        {s.deletion.doneBefore} <strong className="text-ink">{formatDateTime(deleteAfter)}</strong>
        {s.deletion.doneAfter}
      </Dialog.Description>
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onLeave} className={`${button.base} ${button.primary}`}>
          {s.deletion.understood}
        </button>
      </div>
    </>
  );
}

function ConfirmEmail({
  email,
  setEmail,
  account,
}: {
  email: string;
  setEmail: (email: string) => void;
  account: string;
}) {
  return (
    <>
      <label htmlFor="delete-email" className="text-sm font-medium">
        {s.deletion.confirm}
        {account})
      </label>
      <input
        id="delete-email"
        type="email"
        autoComplete="off"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:text-sm"
      />
    </>
  );
}
