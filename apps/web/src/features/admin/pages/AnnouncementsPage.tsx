// «Administración» → «Anuncios»: the one of a publication that could not be saved, writing one about the site, and
// every announcement with its status and «Retirar».
import { useState } from 'react';
import type { AdminAnnouncement, AnnouncementDraft as Draft } from '@qv/schema';
import { AnnouncementDraft } from '@qv/schema';
import { formatDateTime } from '../../../shared/lib/dates';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { button, card } from '../../../shared/ui/styles';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { AnnouncementFields } from '../components/announcements/AnnouncementFields';
import { ConfirmDialog } from '../components/releases/ConfirmDialog';
import {
  useAnnouncements,
  useFailedAnnouncement,
  useSaveAnnouncement,
  useWithdrawAnnouncement,
} from '../hooks/useAnnouncements';
import { failure } from '../model/releases';
import { announcementsPageStrings as s } from './strings/AnnouncementsPage.strings';

const EMPTY: Draft = { kind: 'site', title: '', body: '', items: [] };

export function AnnouncementsPage() {
  return (
    <>
      <AdminSectionTitle title={s.title} />
      <p className="mt-2 text-sm text-muted">{s.intro}</p>
      <FailedOne />
      <SiteForm />
      <List />
    </>
  );
}

function FailedOne() {
  const failed = useFailedAnnouncement();
  const save = useSaveAnnouncement();
  if (!failed) return null;
  return (
    <section className={`${card} mt-6 border-accent/50 p-4 sm:p-5`}>
      <h3 className="font-semibold text-ink">{s.failedTitle(failed.releaseId)}</h3>
      <p className="mt-1 text-sm text-muted">
        {s.failedHelp} «{failed.draft.title}»
      </p>
      <button
        type="button"
        className={`${button.base} ${button.primary} mt-3`}
        disabled={save.isPending}
        onClick={() => save.mutate({ ...failed.draft, releaseId: failed.releaseId })}
      >
        {s.saveAgain}
      </button>
      {save.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {failure(save.error, s.notSaved)}
        </p>
      ) : null}
    </section>
  );
}

function SiteForm() {
  const [draft, setDraft] = useState(EMPTY);
  const save = useSaveAnnouncement();
  const valid = AnnouncementDraft.safeParse(draft);
  const status = save.isError ? failure(save.error, s.notSaved) : save.isSuccess ? s.saved : '';
  return (
    <section aria-labelledby="site-announcement" className={`${card} mt-6 p-4 sm:p-5`}>
      <h3 id="site-announcement" className="font-semibold text-ink">
        {s.write}
      </h3>
      <p className="mt-1 text-sm text-muted">{s.writeHelp}</p>
      <div className="mt-4">
        <AnnouncementFields
          draft={draft}
          disabled={save.isPending}
          onChange={(next) => {
            setDraft(next);
            save.reset();
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className={`${button.base} ${button.primary}`}
          disabled={!valid.success || save.isPending}
          onClick={() =>
            valid.success &&
            save.mutate({ ...valid.data, releaseId: null }, { onSuccess: () => setDraft(EMPTY) })
          }
        >
          {s.save}
        </button>
        <Reserved longest={s.notSaved} className="min-w-0 flex-1 text-sm">
          <p role="status" className={save.isError ? 'text-state-learn' : 'text-muted'}>
            {status}
          </p>
        </Reserved>
      </div>
    </section>
  );
}

function List() {
  const list = useAnnouncements();
  return (
    <section aria-labelledby="all-announcements" className="mt-8">
      <h3 id="all-announcements" className="text-lg font-semibold">
        {s.list}
      </h3>
      {list.isError ? (
        <p role="alert" className={`${card} mt-3 p-5 text-muted`}>
          {s.unreadable}
        </p>
      ) : !list.data ? (
        <div aria-busy="true" className="mt-3 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : list.data.announcements.length === 0 ? (
        <p className={`${card} mt-3 p-5 text-muted`}>{s.empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {list.data.announcements.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

const statusText = (a: AdminAnnouncement) =>
  a.status === 'waiting' ? s.status.waiting(formatDateTime(a.publishAt)) : s.status[a.status];

const origin = (a: AdminAnnouncement) =>
  a.releaseId === null ? s.site : a.releaseTitle ? s.of(a.releaseTitle) : s.ofRelease(a.releaseId);

function Row({ a }: { a: AdminAnnouncement }) {
  const [open, setOpen] = useState(false);
  const withdraw = useWithdrawAnnouncement();
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) withdraw.reset();
  };
  return (
    <li
      className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5`}
      data-announcement={a.id}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap gap-x-2 text-xs text-muted">
          <span
            className={`font-medium ${a.status === 'out' ? 'text-state-review' : a.status === 'waiting' ? 'text-brand' : ''}`}
          >
            {statusText(a)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{origin(a)}</span>
        </p>
        <p className="mt-1 font-semibold text-ink">{a.title}</p>
        {a.body ? <p className="mt-1 text-sm whitespace-pre-line text-muted">{a.body}</p> : null}
        <p className="mt-1 text-xs text-muted">
          {s.by(a.createdBy, formatDateTime(a.createdAt))}
          {a.status === 'withdrawn' && a.withdrawnAt === null ? ` · ${s.undone}` : ''}
        </p>
      </div>
      <button
        type="button"
        className={`${button.base} ${button.secondary} flex-none`}
        disabled={a.status === 'withdrawn'}
        onClick={() => close(true)}
      >
        {s.withdraw}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title={s.confirmTitle}
        confirm={s.confirm}
        busy={withdraw.isPending}
        busyLabel={s.busy}
        error={withdraw.isError ? failure(withdraw.error, s.withdrawFailed) : null}
        onConfirm={() => withdraw.mutate(a.id, { onSuccess: () => close(false) })}
      >
        <p className="font-medium text-ink">{a.title}</p>
        <p>{s.confirmText}</p>
      </ConfirmDialog>
    </li>
  );
}
