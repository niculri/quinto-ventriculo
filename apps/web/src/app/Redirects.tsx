// Redirects from old URLs (saved links and progress) to the canonical ones.
import { Navigate, useLocation, useParams } from 'react-router';
import { courseHasMaterial } from '@qv/schema/http';
import { paths } from '../shared/lib/paths';
import { ErrorWithRetry } from '../shared/ui/Notice';
import { Loading } from '../shared/ui/Loading';
import { NotFoundPage } from '../shared/ui/NotFoundPage';
import { buildAnkiTree, descendants, hasPage } from '../features/catalog/model/tree';
import { findCourse, locateNote } from '../features/catalog/model/catalog';
import { useCatalog } from '../features/catalog/hooks/useCatalog';
import { Canonical } from '../shared/ui/Canonical';

function LegacyRedirect({
  target,
}: {
  target: (c: NonNullable<ReturnType<typeof useCatalog>['data']>) => string | null;
}) {
  const catalog = useCatalog();
  if (catalog.isError) {
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  }
  if (!catalog.data) return <Loading />;
  const path = target(catalog.data);
  return path ? <Canonical path={path} /> : <NotFoundPage />;
}

export function LegacyCourseRedirect() {
  const { courseId = '' } = useParams();
  return (
    <LegacyRedirect
      target={(c) => {
        const found = findCourse(c, courseId);
        return found && courseHasMaterial(c, found.course) ? paths.course(found.course) : null;
      }}
    />
  );
}

export function LegacyNoteRedirect() {
  const { slug = '' } = useParams();
  return (
    <LegacyRedirect
      target={(c) => {
        const found = locateNote(c, 'slug', slug);
        return found ? paths.note(found.course, found.note.slug) : null;
      }}
    />
  );
}

export function LegacyDeckRedirect() {
  const { deckId = '' } = useParams();
  const { search } = useLocation();
  const catalog = useCatalog();
  if (catalog.isError) {
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  }
  if (!catalog.data) return <Loading />;
  const node = buildAnkiTree(catalog.data).byId.get(deckId);
  if (!node) return <NotFoundPage />;
  const subdeck = new URLSearchParams(search).get('subdeck');
  const target = (subdeck ? descendants(node).find((n) => n.slug === subdeck) : undefined) ?? node;
  if (!hasPage(target)) return <NotFoundPage />;
  return <Navigate to={paths.deck(target.ref)} replace />;
}

export function SemesterAnkiRedirect() {
  const { number = '' } = useParams();
  return <Navigate to={paths.semester(Number(number))} replace />;
}
