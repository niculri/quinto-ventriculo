// «Publicar», enabled when the review list is ready, and its popup with what the draft brings.
import { useState } from 'react';
import { releaseTitle } from '@qv/release-review';
import type { ReviewList } from '@qv/release-review';
import type { ReleaseOverview } from '@qv/schema';
import { Reserved } from '../../../../shared/ui/Reserved';
import { button } from '../../../../shared/ui/styles';
import { useIndexLines } from '../../hooks/useIndexLines';
import { usePublishRelease } from '../../hooks/useReleaseChanges';
import { failure, releaseLines } from '../../model/releases';
import { releasesStrings } from '../../releases.strings';
import { ConfirmDialog } from './ConfirmDialog';

const s = releasesStrings.publish;

export function PublishBar({
  review,
  overview,
}: {
  review: ReviewList;
  overview: ReleaseOverview;
}) {
  const [open, setOpen] = useState(false);
  const indexLines = useIndexLines(overview);
  const publish = usePublishRelease();
  const warnings = review.checks.filter((c) => c.severity === 'warn' && c.items.length).length;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) publish.reset();
  };
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        className={`${button.base} ${button.primary}`}
        disabled={!review.ready}
        onClick={() => close(true)}
      >
        {s.button}
      </button>
      <Reserved longest={s.notReady} className="min-w-0 flex-1 text-sm text-muted">
        <p>{review.ready ? s.ready : s.notReady}</p>
      </Reserved>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title={s.title}
        confirm={s.button}
        busy={publish.isPending}
        busyLabel={s.busy}
        error={publish.isError ? failure(publish.error, s.failed) : null}
        onConfirm={() => publish.mutate({ overview, review }, { onSuccess: () => close(false) })}
      >
        <p className="font-medium text-ink">{releaseTitle(overview.summary)}</p>
        <ul className="list-disc space-y-1 pl-5">
          {releaseLines(overview.summary, indexLines).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {warnings ? <p>{s.warnings(warnings)}</p> : null}
        <p>{s.students}</p>
      </ConfirmDialog>
    </div>
  );
}
