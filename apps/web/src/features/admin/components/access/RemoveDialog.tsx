// Removing a person or a whole list: what it does, the name written to confirm, and then what was done.
import { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Reserved } from '../../../../shared/ui/Reserved';
import { button } from '../../../../shared/ui/styles';
import { normalizeEmail } from '../../api/repository';
import type { RemoveResult } from '../../api/repository';
import { useRemoveInvites } from '../../hooks/useAccess';
import { accessFailure } from '../../hooks/accessFailure';
import type { Removing } from '../../model/access';
import { accessStrings } from '../../access.strings';
import { AccessDialog, DoneButton, Emails } from './AccessDialog';

const s = accessStrings.remove;

export function RemoveDialog({ target: t, onClose }: { target: Removing; onClose: () => void }) {
  const id = useId();
  const remove = useRemoveInvites();
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<RemoveResult | null>(null);
  const expected = t.kind === 'person' ? t.email : t.list;
  const matches =
    t.kind === 'person'
      ? normalizeEmail(typed) === normalizeEmail(expected)
      : typed.trim() === expected.trim();
  const busy = remove.isPending;
  const close = () => {
    if (busy) return;
    onClose();
  };
  const title = t.kind === 'person' ? s.person(t.email) : s.list(t.list);
  return (
    <AccessDialog open onClose={close} busy={busy} title={done ? s.done : title}>
      {done ? (
        <RemoveDone done={done} onClose={close} />
      ) : (
        <RemoveForm
          id={id}
          target={t}
          typed={typed}
          onType={setTyped}
          matches={matches}
          busy={busy}
          error={remove.isError ? accessFailure(remove.error) : null}
          onCancel={close}
          onSubmit={() =>
            remove.mutate(t.kind === 'person' ? { emails: [t.email] } : { list: t.list }, {
              onSuccess: setDone,
            })
          }
        />
      )}
    </AccessDialog>
  );
}

function RemoveRules({ target: t }: { target: Removing }) {
  return (
    <Dialog.Description asChild>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        <li>{t.kind === 'person' ? s.personRule : s.listRule(t.count)}</li>
        <li>{s.keeps}</li>
        <li>{s.adminStays}</li>
      </ul>
    </Dialog.Description>
  );
}

function RemoveDone({ done, onClose }: { done: RemoveResult; onClose: () => void }) {
  return (
    <>
      <Dialog.Description className="mt-2 text-sm text-muted">
        {s.removed(done.removed.length)}
        {s.and}
        {s.sessions(done.sessionsClosed)}
        {s.end}
        {done.openToDomain ? s.openToDomain : ''}
      </Dialog.Description>
      <div className="mt-4 space-y-3 text-sm">
        <Emails title={s.left} emails={done.removed} />
        <Emails title={s.kept} emails={done.keptAdmins} why={s.keptWhy} />
        <Emails title={s.notInvited} emails={done.notInvited} />
      </div>
      <DoneButton onClick={onClose} />
    </>
  );
}

function RemoveForm({
  id,
  target: t,
  typed,
  onType,
  matches,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  id: string;
  target: Removing;
  typed: string;
  onType: (typed: string) => void;
  matches: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const expected = t.kind === 'person' ? t.email : t.list;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!matches || busy) return;
        onSubmit();
      }}
    >
      <RemoveRules target={t} />
      <label htmlFor={`${id}-confirm`} className="mt-5 block text-sm font-medium">
        {s.confirm}
        {t.kind === 'person' ? s.theEmail : s.theList}
        {accessStrings.open}
        <span className={`font-mono ${t.kind === 'person' ? 'break-all' : 'break-words'}`}>
          {expected}
        </span>
        {accessStrings.close}
      </label>
      <input
        id={`${id}-confirm`}
        value={typed}
        onChange={(e) => onType(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:text-sm"
      />
      <Reserved longest={accessStrings.genericFailure} className="mt-2 text-sm">
        {error !== null ? (
          <p role="alert" className="text-state-learn">
            {error}
          </p>
        ) : null}
      </Reserved>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`${button.base} ${button.secondary}`}
        >
          {s.cancel}
        </button>
        <button
          type="submit"
          disabled={!matches || busy}
          className={`${button.base} ${button.danger}`}
        >
          <span className="grid place-items-center">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1">
              {t.kind === 'person' ? s.removing : s.removeList}
            </span>
            <span className="col-start-1 row-start-1">
              {busy ? s.removing : t.kind === 'person' ? s.removePerson : s.removeList}
            </span>
          </span>
        </button>
      </div>
    </form>
  );
}
