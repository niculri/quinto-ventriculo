// «Publicar», enabled when the review list is ready, and its popup with what the draft brings.
import { useState } from 'react';
import { announcementDraft, releaseTitle } from '@qv/release-review';
import type { ReviewList } from '@qv/release-review';
import { AnnouncementDraft } from '@qv/schema';
import type { ReleaseOverview } from '@qv/schema';
import { Switch } from '../../../../shared/ui/Switch';
import { AnnouncementFields } from '../announcements/AnnouncementFields';
import { Reserved } from '../../../../shared/ui/Reserved';
import { button } from '../../../../shared/ui/styles';
import { useIndexLines } from '../../hooks/useIndexLines';
import { usePublishRelease } from '../../hooks/useReleaseChanges';
import { failure, releaseLines } from '../../model/releases';
import { publishBarStrings as s } from './strings/PublishBar.strings';
import { ConfirmDialog } from './ConfirmDialog';

/** It starts on only when it has something to tell (only format changed: no text) and somebody to tell it to. */
const tellsSomething = (draft: AnnouncementDraft) => draft.items.length > 0 && draft.body !== '';

export function PublishBar({
  review,
  overview,
}: {
  review: ReviewList;
  overview: ReleaseOverview;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => announcementDraft(overview.summary));
  const [announce, setAnnounce] = useState(() => tellsSomething(draft));
  const indexLines = useIndexLines(overview);
  const publish = usePublishRelease();
  const warnings = review.checks.filter((c) => c.severity === 'warn' && c.items.length).length;
  const close = (o: boolean) => {
    setOpen(o);
    if (o) {
      const proposed = announcementDraft(overview.summary);
      setDraft(proposed);
      setAnnounce(tellsSomething(proposed));
    } else publish.reset();
  };
  const valid = AnnouncementDraft.safeParse(draft);
  const announcement = announce && valid.success ? valid.data : null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        className={`${button.base} ${button.primary}`}
        disabled={!review.ready}
        onClick={() => close(true)}
      >
        {s.publish.button}
      </button>
      <Reserved longest={s.publish.notReady} className="min-w-0 flex-1 text-sm text-muted">
        <p>{review.ready ? s.publish.ready : s.publish.notReady}</p>
      </Reserved>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title={s.publish.title}
        confirm={s.publish.button}
        busy={publish.isPending}
        busyLabel={s.publish.busy}
        error={publish.isError ? failure(publish.error, s.publish.failed) : null}
        confirmDisabled={announce && !valid.success}
        onConfirm={() =>
          publish.mutate({ overview, review, announcement }, { onSuccess: () => close(false) })
        }
        form={
          <div className="mt-4 border-t border-border pt-4">
            <div className="relative isolate flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{s.announce.label}</p>
                <p className="mt-0.5 text-xs text-muted">{s.announce.help}</p>
              </div>
              <Switch
                label={s.announce.label}
                checked={announce}
                wholeRow
                disabled={publish.isPending || !draft.items.length}
                onChange={setAnnounce}
              />
            </div>
            <div className="mt-3">
              <AnnouncementFields
                draft={draft}
                onChange={setDraft}
                disabled={!announce || publish.isPending}
                withKind
              />
            </div>
          </div>
        }
      >
        <p className="font-medium text-ink">{releaseTitle(overview.summary)}</p>
        <ul className="list-disc space-y-1 pl-5">
          {releaseLines(overview.summary, indexLines).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {warnings ? <p>{s.publish.warnings(warnings)}</p> : null}
        <p>{s.publish.students}</p>
      </ConfirmDialog>
    </div>
  );
}
