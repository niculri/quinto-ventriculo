// The last publication, and undoing it from its own popup while it is the last one.
import { useState } from 'react';
import { Skeleton } from '../../../../shared/ui/Loading';
import { Reserved } from '../../../../shared/ui/Reserved';
import { button, card } from '../../../../shared/ui/styles';
import { useReleaseLog } from '../../hooks/useReleases';
import { useRevertRelease } from '../../hooks/useReleaseChanges';
import { failure, releaseLine } from '../../model/releases';
import { releasesStrings } from '../../releases.strings';
import { ConfirmDialog } from './ConfirmDialog';

const s = releasesStrings.last;

export function LastRelease() {
  const log = useReleaseLog();
  const revert = useRevertRelease();
  const [open, setOpen] = useState(false);
  const last = log.data?.releases[0] ?? null;
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) revert.reset();
  };
  return (
    <section
      aria-labelledby="last-release"
      className={`${card} mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5`}
    >
      <div className="min-w-0 flex-1">
        <h3 id="last-release" className="font-semibold">
          {s.title}
        </h3>
        <Reserved longest={s.longest} className="mt-1 text-sm text-muted">
          {log.isError ? (
            <p role="alert">{s.unreadable}</p>
          ) : !log.data ? (
            <Skeleton className="h-4 w-3/4" />
          ) : last ? (
            <p role="status">
              <span className="text-ink">{s.head(last.id, last.title)}</span> {releaseLine(last)}
            </p>
          ) : (
            <p role="status">{s.none}</p>
          )}
        </Reserved>
      </div>
      <button
        type="button"
        className={`${button.base} ${button.secondary} flex-none`}
        disabled={!last?.canRevert}
        onClick={() => close(true)}
      >
        {s.undo}
      </button>
      {last ? (
        <ConfirmDialog
          open={open}
          onOpenChange={close}
          title={s.confirmTitle(last.id)}
          confirm={s.confirm}
          busy={revert.isPending}
          busyLabel={s.busy}
          error={revert.isError ? failure(revert.error, s.failed) : null}
          onConfirm={() => revert.mutate(last.id, { onSuccess: () => close(false) })}
        >
          <p className="font-medium text-ink">{last.title}</p>
          <p>{s.back}</p>
          <p>{s.progress}</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
