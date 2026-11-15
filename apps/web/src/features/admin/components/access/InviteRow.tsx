// One invited person: email, dates and note, and the buttons the viewer may use on them.
import { formatDate, formatDateTime } from '../../../../shared/lib/dates';
import { button } from '../../../../shared/ui/styles';
import type { AccessInvite } from '../../api/repository';
import { accessStrings } from '../../access.strings';

const s = accessStrings.row;
const secondary = `${button.base} ${button.secondary} px-3 py-1.5`;

export function InviteRow({
  invite: i,
  isOwner,
  youAreOwner,
  onRemove,
  onAppoint,
}: {
  invite: AccessInvite;
  isOwner: boolean;
  youAreOwner: boolean;
  onRemove: () => void;
  onAppoint: (admin: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="font-mono text-sm break-all text-ink">{i.email}</p>
        <p className="mt-0.5 text-xs text-muted">
          {s.invitedOn(formatDate(i.invitedAt))}
          {accessStrings.sep}
          {i.hasAccount
            ? i.lastSignInAt
              ? s.lastSignIn(formatDateTime(i.lastSignInAt))
              : s.hasAccount
            : s.noAccount}
          {i.note ? `${accessStrings.sep}${i.note}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {i.admin ? (
          <>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              {isOwner ? s.owner : s.admin}
            </span>
            {youAreOwner && !isOwner ? (
              <button
                type="button"
                onClick={() => onAppoint(false)}
                aria-label={s.unappointLabel(i.email)}
                className={secondary}
              >
                {s.unappoint}
              </button>
            ) : null}
          </>
        ) : (
          <>
            {youAreOwner ? (
              <button
                type="button"
                onClick={() => onAppoint(true)}
                aria-label={s.appointLabel(i.email)}
                className={secondary}
              >
                {s.appoint}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              aria-label={s.removeLabel(i.email)}
              className={secondary}
            >
              {s.remove}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
