// The loading state of a note's page, as tall as the note's header, with the real breadcrumbs once the catalog is in.
import { Skeleton } from '../../../shared/ui/Loading';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { page } from '../../../shared/ui/styles';
import type { NoteLocation } from '../../catalog/model/catalog';
import { noteCrumbs } from '../model/noteCrumbs';
import { noteSkeletonStrings } from './strings/NoteSkeleton.strings';

/** Real breadcrumbs once the catalog is in: on a phone they wrap, and a one-line stand-in would move the title. */
export function NoteSkeleton({ location }: { location: NoteLocation | null }) {
  return (
    <div className={page}>
      {location ? (
        <Breadcrumbs items={noteCrumbs(location, location.note.title)} />
      ) : (
        <div className="mb-4 flex h-5 items-center">
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      )}
      <div role="status" aria-label={noteSkeletonStrings.loading}>
        <div className="mb-10 border-b border-border pb-8">
          <div className="flex h-[2.625rem] items-center sm:h-[3.25rem]">
            <Skeleton className="h-9 w-3/4 sm:h-11" />
          </div>
          <div className="mt-4 flex h-[1.5625rem] items-center">
            <Skeleton className="h-5 w-1/2" />
          </div>
          <Skeleton className="mt-4 h-5 w-64 max-w-full" />
          <Skeleton className="mt-4 h-5 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
