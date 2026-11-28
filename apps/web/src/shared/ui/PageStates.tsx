// A whole page that is loading or failed to load, in the page's own frame: the breadcrumbs' row and the title where
// every page has them (the real ones when they are known), and the spinner or the error where its content goes.
import type { ReactNode } from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import type { Crumb } from './Breadcrumbs';
import { Loading, Skeleton } from './Loading';
import { ErrorWithRetry } from './Notice';
import { page } from './styles';

/**
 * The breadcrumbs' row (one line of `text-sm`) and the title (a line of `text-3xl`), as tall as the real ones; an
 * unknown title is a gray bar while loading and nothing after an error.
 */
function Frame({
  crumbs,
  title,
  loading,
  children,
}: {
  crumbs: Crumb[] | null;
  title: string | null;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div className={page}>
      {crumbs ? <Breadcrumbs items={crumbs} /> : <div aria-hidden="true" className="mb-4 h-5" />}
      {title ? (
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
      ) : loading ? (
        <div aria-hidden="true" className="flex h-9 items-center">
          <Skeleton className="h-7 w-64 max-w-full" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function PageLoading({
  crumbs = null,
  title = null,
}: {
  crumbs?: Crumb[] | null;
  title?: string | null;
}) {
  return (
    <Frame crumbs={crumbs} title={title} loading>
      <div aria-busy="true">
        <Loading />
      </div>
    </Frame>
  );
}

export function PageError({
  error,
  onRetry,
  crumbs = null,
  title = null,
}: {
  error: unknown;
  onRetry: () => void;
  crumbs?: Crumb[] | null;
  title?: string | null;
}) {
  return (
    <Frame crumbs={crumbs} title={title} loading={false}>
      <ErrorWithRetry
        error={error}
        onRetry={onRetry}
        className={title ? 'mt-8 max-w-lg' : 'max-w-lg'}
      />
    </Frame>
  );
}
