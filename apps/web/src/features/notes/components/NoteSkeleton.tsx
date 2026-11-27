// The loading state of a note's page, as tall as the note's header and index bar, with the real breadcrumbs: before
// they are known, the frame every page has while it loads.
import { Skeleton } from '../../../shared/ui/Loading';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { page } from '../../../shared/ui/styles';
import { PageLoading } from '../../../shared/ui/PageStates';
import type { NoteLocation } from '../../catalog/model/catalog';
import { noteCrumbs } from '../model/noteCrumbs';
import { HEADER_BOX, HeaderLines } from './HeaderLines';
import { noteSkeletonStrings } from './strings/NoteSkeleton.strings';

/** The header's lines come from the catalog and wrap as the article's; under `xl`, the room of the index bar (`TocBar`). */
export function NoteSkeleton({ location }: { location: NoteLocation | null }) {
  if (!location) return <PageLoading />;
  return (
    <div className={page}>
      <Breadcrumbs items={noteCrumbs(location, location.note.title)} />
      <div role="status" aria-label={noteSkeletonStrings.loading}>
        <div className={HEADER_BOX} aria-hidden="true">
          <HeaderLines note={location.note} ghost />
          <div className="mt-1.5 flex h-5 items-center">
            <Skeleton className="h-4 w-44 max-w-full" />
          </div>
        </div>
        <div className="mb-6 h-[2.375rem] xl:hidden">
          <Skeleton className="size-full" />
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
