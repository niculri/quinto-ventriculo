// «Tu cuenta» in «Datos de usuario»: the picture (or the initials), the name and email, and the dates of the account.
import type { ReactNode } from 'react';
import { formatDateTime } from '../../../shared/lib/dates';
import { initials } from '../../../shared/lib/initials';
import { card } from '../../../shared/ui/styles';
import type { SessionUser } from '../../session/api/service';
import { accountCardStrings as s } from './strings/AccountCard.strings';

export function AccountCard({ user }: { user: SessionUser }) {
  return (
    <section aria-label={s.card.label} className={`${card} mt-6 p-5 sm:p-6`}>
      <div className="flex items-center gap-4">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={s.card.photo}
            referrerPolicy="no-referrer"
            className="size-16 flex-none rounded-full object-cover"
          />
        ) : (
          <span
            role="img"
            aria-label={s.card.noPhoto}
            className="flex size-16 flex-none items-center justify-center rounded-full bg-brand text-xl font-semibold text-white dark:text-[#0a1316]"
          >
            {initials(user.name, user.email)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-ink">{user.name ?? s.card.noName}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
        <Row label={s.card.name}>{user.name ?? s.card.nameMissing}</Row>
        <Row label={s.card.email}>{user.email}</Row>
        <Row label={s.card.created}>
          {user.createdAt ? formatDateTime(user.createdAt) : s.card.missing}
        </Row>
        <Row label={s.card.lastSignIn}>
          {user.lastSignInAt ? formatDateTime(user.lastSignInAt) : s.card.missing}
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
