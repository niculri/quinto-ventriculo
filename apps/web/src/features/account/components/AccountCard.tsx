// «Tu cuenta» in «Datos de usuario»: the picture (or the initials), the name and email, and the dates of the account.
import type { ReactNode } from 'react';
import { formatDateTime } from '../../../shared/lib/dates';
import { initials } from '../../../shared/lib/initials';
import { card } from '../../../shared/ui/styles';
import type { SessionUser } from '../../session/api/service';
import { accountStrings } from '../strings';

const s = accountStrings.card;

export function AccountCard({ user }: { user: SessionUser }) {
  return (
    <section aria-label={s.label} className={`${card} mt-6 p-5 sm:p-6`}>
      <div className="flex items-center gap-4">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={s.photo}
            referrerPolicy="no-referrer"
            className="size-16 flex-none rounded-full object-cover"
          />
        ) : (
          <span
            role="img"
            aria-label={s.noPhoto}
            className="flex size-16 flex-none items-center justify-center rounded-full bg-brand text-xl font-semibold text-white dark:text-[#0a1316]"
          >
            {initials(user.name, user.email)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-ink">{user.name ?? s.noName}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
        <Row label={s.name}>{user.name ?? s.nameMissing}</Row>
        <Row label={s.email}>{user.email}</Row>
        <Row label={s.created}>{user.createdAt ? formatDateTime(user.createdAt) : s.missing}</Row>
        <Row label={s.lastSignIn}>
          {user.lastSignInAt ? formatDateTime(user.lastSignInAt) : s.missing}
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6">
      <dt className="text-muted sm:w-44 sm:flex-none">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}
