// «Invitar»: the emails pasted, the list (one of them or a new one) and a note; then what the invitation did.
import { useId } from 'react';
import { UserPlus } from 'lucide-react';
import { Reserved } from '../../../../shared/ui/Reserved';
import { Select } from '../../../../shared/ui/Select';
import { button, card } from '../../../../shared/ui/styles';
import { NEW_LIST } from '../../model/access';
import { useInviteForm } from '../../hooks/useInviteForm';
import { inviteFormStrings as s } from './strings/InviteForm.strings';
import { accessFailureStrings } from '../../hooks/strings/accessFailure.strings';
import { InviteResultDialog } from './InviteResultDialog';

const field = 'mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink';

type Form = ReturnType<typeof useInviteForm>;

export function InviteForm({ lists }: { lists: string[] }) {
  const id = useId();
  const f = useInviteForm(lists);
  return (
    <section aria-labelledby={`${id}-title`} className={`${card} mt-6 px-4 py-4 sm:px-5`}>
      <h3 id={`${id}-title`} className="font-semibold">
        {s.form.title}
      </h3>
      <form
        className="mt-3 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          f.submit();
        }}
      >
        <div>
          <label htmlFor={`${id}-emails`} className="text-sm font-medium">
            {s.form.emails}
          </label>
          <textarea
            id={`${id}-emails`}
            rows={5}
            value={f.text}
            onChange={(e) => f.setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={s.form.emailsHint}
            className="mt-1.5 block w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 font-mono text-base text-ink sm:text-sm"
          />
          {/* The longest text is the failure's message, not the count: on a small phone it takes two lines. */}
          <Reserved longest={accessFailureStrings.genericFailure} className="mt-1 text-xs">
            <p
              role={f.invite.isError ? 'alert' : undefined}
              className={f.invite.isError || f.tooMany ? 'text-state-learn' : 'text-muted'}
            >
              {f.status}
            </p>
          </Reserved>
        </div>
        <ListFields id={id} form={f} />
        <div>
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            {s.form.note} <span className="font-normal text-muted">{s.form.optional}</span>
          </label>
          <input
            id={`${id}-note`}
            value={f.note}
            maxLength={200}
            onChange={(e) => f.setNote(e.target.value)}
            autoComplete="off"
            className={`${field} sm:h-10 sm:text-sm`}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!f.ready || f.invite.isPending}
            className={`${button.base} ${button.primary}`}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            <span className="grid place-items-center">
              <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                {s.form.inviting}
              </span>
              <span className="col-start-1 row-start-1">
                {f.invite.isPending ? s.form.inviting : s.form.invite}
              </span>
            </span>
          </button>
        </div>
      </form>
      <InviteResultDialog done={f.result} onClose={f.closeResult} />
    </section>
  );
}

/** «Lista»: one of the lists or a new one, and the new one's name. */
function ListFields({ id, form: f }: { id: string; form: Form }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <span className="text-sm font-medium" aria-hidden="true">
          {s.form.list}
        </span>
        <Select
          label={s.form.list}
          value={f.choice}
          options={[
            ...f.names.map((n) => ({ value: `list:${n}`, label: n })),
            { value: NEW_LIST, label: s.form.newList },
          ]}
          onChange={f.setChoice}
          className="mt-1.5 h-11 w-full sm:h-10"
        />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-new`} className="text-sm font-medium">
          {s.form.newName}
        </label>
        <input
          id={`${id}-new`}
          value={f.choice === NEW_LIST ? f.newName : ''}
          disabled={f.choice !== NEW_LIST}
          maxLength={60}
          onChange={(e) => f.setNewName(e.target.value)}
          placeholder={f.choice === NEW_LIST ? s.form.newNameHint : ''}
          autoComplete="off"
          className={`${field} disabled:opacity-50 sm:h-10 sm:text-sm`}
        />
      </div>
    </div>
  );
}
