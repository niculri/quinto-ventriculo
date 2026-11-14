// Redirects to a canonical URL, keeping the current query and anchor.
import { Navigate, useLocation } from 'react-router';

/** Keeps the `?query` (merged under `path`'s own) and the `#anchor` of the current URL. */
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
