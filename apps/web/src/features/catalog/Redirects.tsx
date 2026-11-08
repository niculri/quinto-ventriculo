import { Navigate, useLocation, useParams } from 'react-router';
import { paths } from '../../app/paths';
import { ErrorWithRetry } from '../../ui/Notice';
import { Loading } from '../../ui/Loading';
import { NotFoundPage } from '../../ui/NotFoundPage';
import { buildAnkiTree, descendants, hasPage } from '../anki/tree';
import { findCourse, locateNote, useCatalog } from './queries';

/** Goes to `path` replacing the history entry, keeping the `?query` and the `#anchor` of the current URL. */
export function Canonical({ path }: { path: string }) {
  const { search, hash } = useLocation();
  const [base, query] = path.split('?');
  const merged = new URLSearchParams(query);
  new URLSearchParams(search).forEach((v, k) => {
    if (!merged.has(k)) merged.set(k, v);
  });
  const text = merged.toString();
  return <Navigate to={`${base}${text ? `?${text}` : ''}${hash}`} replace />;
}

/** Old routes (/courses/:courseId, /notes/:slug, /decks/:deckId) → the canonical one, from the catalog. */
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
        return found ? paths.course(found.course) : null;
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

/** `/decks/:deckId[?subdeck=<slug>]` (v1.1) → the deck's page in the tree (or its subdeck's). */
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
  const target = (subdeck && descendants(node).find((n) => n.slug === subdeck)) || node;
  if (!hasPage(target)) return <NotFoundPage />;
  return <Navigate to={paths.deck(target.ref)} replace />;
}

/** `/semesters/:n/anki[/study]` (v1.3, a semester's decks): to the semester's page, with its courses. */
export function SemesterAnkiRedirect() {
  const { number = '' } = useParams();
  return <Navigate to={paths.semester(Number(number))} replace />;
}
