// The cards page while its cards load: the places of the controls and the list.
import { Skeleton } from '../../../shared/ui/Loading';
import { ListSkeleton } from './ListSkeleton';

export function CardsBodySkeleton() {
  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-full sm:w-64" />
        <Skeleton className="h-10 min-w-0 flex-1" />
      </div>
      <div className="mt-3 flex h-10 items-center">
        <Skeleton className="h-4 w-40" />
      </div>
      <ListSkeleton />
    </>
  );
}
