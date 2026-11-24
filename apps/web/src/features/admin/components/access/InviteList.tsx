// One list of «Invitados»: its name and counts, choosing all of it, «Sacar la lista» and a row for each person.
import { UserMinus } from 'lucide-react';
import { button, card } from '../../../../shared/ui/styles';
import type { AccessInvite, AccessReport } from '../../api/repository';
import { listChoiceState, listCounts, removableCount } from '../../model/access';
import type { Appointing, Removing } from '../../model/access';
import { inviteListStrings as s } from './strings/InviteList.strings';
import { inviteRowStrings } from './strings/InviteRow.strings';
import { ChooseBox } from './ChooseBox';
import { InviteRow } from './InviteRow';

export function InviteList({
  list,
  people,
  report,
  chosen,
  onChoose,
  busy,
  onRemove,
  onAppoint,
}: {
  list: string;
  people: AccessInvite[];
  report: AccessReport;
  chosen: ReadonlySet<string>;
  onChoose: (emails: string[], on: boolean) => void;
  busy: boolean;
  onRemove: (target: Removing) => void;
  onAppoint: (target: Appointing) => void;
}) {
  const counts = listCounts(report, list);
  const removable = removableCount(people);
  return (
    <article aria-label={s.invited.list(list)} className={card}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <ChooseBox
            label={s.invited.chooseList(list)}
            state={listChoiceState(people, chosen)}
            onChange={(on) =>
              onChoose(
                people.map((p) => p.email),
                on,
              )
            }
            disabled={busy}
          />
          <div className="min-w-0">
            <h4 className="font-semibold break-words">{list}</h4>
            <p className="text-xs text-muted">
              {s.invited.invitedCount(counts?.invited ?? people.length)}
              {inviteRowStrings.sep}
              {s.invited.withAccount(counts?.withAccount ?? 0)}
            </p>
          </div>
        </div>
        {removable ? (
          <button
            type="button"
            onClick={() => onRemove({ kind: 'list', list, count: removable })}
            className={`${button.base} ${button.danger} px-3 py-1.5`}
          >
            <UserMinus className="size-4" aria-hidden="true" /> {s.invited.removeList}
          </button>
        ) : null}
      </header>
      <ul className="divide-y divide-border">
        {people.map((p) => (
          <InviteRow
            key={p.email}
            invite={p}
            isOwner={p.email === report.owner}
            youAreOwner={report.youAreOwner}
            chosen={chosen.has(p.email)}
            onChoose={(on) => onChoose([p.email], on)}
            busy={busy}
            onRemove={() => onRemove({ kind: 'person', email: p.email })}
            onAppoint={(admin) => onAppoint({ email: p.email, admin })}
          />
        ))}
      </ul>
    </article>
  );
}
