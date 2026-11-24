// A note's page: the article from its URL, a 404, its loading state, or the way to its canonical URL.
import { useParams } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { ApiRequestError } from '../../../shared/lib/api';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { useReadingFonts } from '../../../shared/lib/useReadingFonts';
import { locateNote } from '../../catalog/model/catalog';
import { useCatalog, useNote } from '../../catalog/hooks/useCatalog';
import { useCountOpen } from '../../usage/api/count';
import { NoteView } from '../components/NoteView';
import { NoteSkeleton } from '../components/NoteSkeleton';

export function NotePage() {
  const { noteSlug: slug = '', number = '', courseId = '' } = useParams();
  const note = useNote(slug);
  // Only this page counts as opening a note.
  useCountOpen('note', note.data ? slug : null);
  const catalog = useCatalog();
  const fonts = useReadingFonts('article');
  const location = catalog.data ? locateNote(catalog.data, 'slug', slug) : null;

  if (note.isError) {
    if (note.error instanceof ApiRequestError && note.error.status === 404) return <NotFoundPage />;
    return <ErrorWithRetry error={note.error} onRetry={() => void note.refetch()} />;
  }
  // Without the catalog the path is not known yet: drawn later, it would push the article down a line or two. Only
  // its first request is awaited: once it failed (it retries for seconds) or waits for the connection, the article goes.
  const pathComing =
    catalog.isPending && catalog.fetchStatus === 'fetching' && catalog.failureCount === 0;
  if (!note.data || !fonts || pathComing) return <NoteSkeleton location={location} />;
  if (
    location &&
    (String(location.semester.number) !== number || location.course.id !== courseId)
  ) {
    return <Canonical path={paths.note(location.course, location.note.slug)} />;
  }
  return <NoteView key={note.data.id} note={note.data} location={location} />;
}
