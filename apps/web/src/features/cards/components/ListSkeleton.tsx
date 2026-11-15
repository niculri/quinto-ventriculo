// The cards page's list while it loads: a lecture, a topic and rows, at their heights.
import { Skeleton } from '../../../shared/ui/Loading';
import { listMetrics } from '../model/list';

export function ListSkeleton() {
  const wide = typeof window === 'undefined' ? true : window.innerWidth >= 640;
  const m = listMetrics(800, wide);
  return (
    <div className="mt-2" aria-hidden="true">
      <div className="flex items-end px-1 pb-2" style={{ height: m.lecture }}>
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="flex items-center border-b border-border px-1" style={{ height: m.topic }}>
        <Skeleton className="h-3.5 w-40" />
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border/70 px-2"
          style={{ height: m.row }}
        >
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}
