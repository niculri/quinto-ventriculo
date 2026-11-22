// The record of publications, newest first, each one published or undone.
import { Skeleton } from '../../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../../shared/ui/Notice';
import { card } from '../../../../shared/ui/styles';
import { useReleaseLog } from '../../hooks/useReleases';
import { releaseLine } from '../../model/releases';
import { releaseLogStrings as s } from './strings/ReleaseLog.strings';
import { lastReleaseStrings } from './strings/LastRelease.strings';
import { Badge } from './Badge';

export function ReleaseLog() {
  const log = useReleaseLog();
  return (
    <section aria-labelledby="release-log" className="mt-10">
      <h3 id="release-log" className="text-lg font-semibold">
        {s.log.title}
      </h3>
      {log.isError ? (
        <div className="mt-3">
          <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
        </div>
      ) : !log.data ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : log.data.releases.length ? (
        <ul className={`${card} mt-3 divide-y divide-border`}>
          {log.data.releases.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5" data-release={r.id}>
              <span className="w-14 flex-none text-sm font-semibold text-ink">
                {s.log.number(r.id)}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block break-words text-ink">{r.title}</span>
                <span className="block text-muted">{releaseLine(r)}</span>
              </span>
              <Badge tone={r.status === 'published' ? 'new' : 'muted'}>
                {r.status === 'published' ? s.log.published : s.log.reverted}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${card} mt-3 p-5 text-sm text-muted`}>{lastReleaseStrings.last.none}</p>
      )}
    </section>
  );
}
