// The loading state of a note's page, as tall as the note's header, with the real breadcrumbs: before they are known
// it draws nothing, since anything drawn would move when they come.
import { Skeleton } from '../../../shared/ui/Loading';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { page } from '../../../shared/ui/styles';
import type { NoteLocation } from '../../catalog/model/catalog';
import { noteCrumbs } from '../model/noteCrumbs';
import { noteSkeletonStrings } from './strings/NoteSkeleton.strings';

/** On a phone the breadcrumbs wrap, so their height is known only with them: a stand-in would move the title. */
export function NoteSkeleton({ location }: { location: NoteLocation | null }) {
  if (!location) {
    return (
      <div className={page}>
        <div role="status" aria-label={noteSkeletonStrings.loading} />
      </div>
    );
  }
  return (
    <div className={page}>
      <Breadcrumbs items={noteCrumbs(location, location.note.title)} />
      <div role="status" aria-label={noteSkeletonStrings.loading}>
        <div className="mb-6 border-b border-border pb-3.5">
          <div className="flex h-[2.125rem] items-center sm:h-10">
            <Skeleton className="h-7 w-3/4 sm:h-8" />
          </div>
          <div className="mt-2 flex h-[1.421875rem] items-center">
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="mt-1.5 flex h-5 items-center">
            <Skeleton className="h-4 w-44 max-w-full" />
          </div>
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
