// The accounts that exist without an invitation, on top of «Acceso».
import { TriangleAlert } from 'lucide-react';
import { formatDate, formatDateTime } from '../../../../shared/lib/dates';
import type { AccessReport } from '../../api/repository';
import { accessStrings } from '../../access.strings';

const s = accessStrings.strays;

export function Strays({ report }: { report: AccessReport }) {
  const n = report.accountsWithoutInvite.length;
  return (
    <section
      aria-labelledby="strays"
      className="mt-6 rounded-xl border border-[#c2410c]/30 bg-[#c2410c]/6 px-4 py-4 sm:px-5"
    >
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 size-5 flex-none text-[#c2410c]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 id="strays" className="font-semibold">
            {s.title(n)}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {s.before}
            {report.openToDomain ? '' : s.notSeen}
            {s.after}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {report.accountsWithoutInvite.map((a) => (
              <li key={a.email} className="flex flex-wrap justify-between gap-x-4">
                <span className="font-mono break-all text-ink">{a.email}</span>
                <span className="text-xs text-muted">
                  {s.created(formatDate(a.createdAt))}
                  {a.lastSignInAt ? s.lastSignIn(formatDateTime(a.lastSignInAt)) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
