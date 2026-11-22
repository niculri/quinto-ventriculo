// «Acceso» once its report came: the accounts without an invitation, who comes in, the form, the invited by list and
// the popups to remove and to name.
import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { card } from '../../../../shared/ui/styles';
import type { AccessReport } from '../../api/repository';
import { appointingKey, invitesByList, removalKey } from '../../model/access';
import type { Appointing, Removing } from '../../model/access';
import { accessViewStrings as s } from './strings/AccessView.strings';
import { AdminDialog } from './AdminDialog';
import { InviteForm } from './InviteForm';
import { InviteList } from './InviteList';
import { RemoveDialog } from './RemoveDialog';
import { Strays } from './Strays';

export function AccessView({ report }: { report: AccessReport }) {
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [appointing, setAppointing] = useState<Appointing | null>(null);
  const byList = useMemo(() => invitesByList(report.invited), [report.invited]);
  return (
    <>
      {report.accountsWithoutInvite.length ? <Strays report={report} /> : null}
      <section aria-labelledby="who" className={`${card} mt-6 flex gap-3 px-4 py-4 sm:px-5`}>
        <Users className="mt-0.5 size-5 flex-none text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="who" className="font-semibold">
            {s.who.title}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {report.openToDomain
              ? s.who.open
              : s.who.invitedOnly(report.invited.length, report.lists.length)}
          </p>
        </div>
      </section>
      <InviteForm lists={report.lists.map((l) => l.list)} />
      <section aria-labelledby="invited" className="mt-8">
        <h3 id="invited" className="text-lg font-semibold">
          {s.invited.title}
        </h3>
        {byList.length ? (
          <div className="mt-3 space-y-4">
            {byList.map(([list, people]) => (
              <InviteList
                key={list}
                list={list}
                people={people}
                report={report}
                onRemove={setRemoving}
                onAppoint={setAppointing}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-muted">{s.invited.none}</p>
        )}
      </section>
      {/* A new popup for each one: nothing of the one before stays (what was written, its answer). */}
      {removing ? (
        <RemoveDialog
          key={removalKey(removing)}
          target={removing}
          onClose={() => setRemoving(null)}
        />
      ) : null}
      {appointing ? (
        <AdminDialog
          key={appointingKey(appointing)}
          target={appointing}
          onClose={() => setAppointing(null)}
        />
      ) : null}
    </>
  );
}
