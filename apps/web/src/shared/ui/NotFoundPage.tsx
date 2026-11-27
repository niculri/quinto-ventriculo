// The 404 page.
import { Link } from 'react-router';
import { useTitle } from '../hooks/useTitle';
import { paths } from '../lib/paths';
import { button } from './styles';
import { notFoundPageStrings } from './strings/NotFoundPage.strings';
import { sharedStrings } from '../strings/shared.strings';

export function NotFoundPage() {
  useTitle(notFoundPageStrings.notFound.tab);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="font-serif text-6xl font-semibold text-brand">404</p>
      <h1 className="mt-4 text-xl font-semibold">{notFoundPageStrings.notFound.title}</h1>
      <p className="mt-2 text-muted">{notFoundPageStrings.notFound.body}</p>
      <Link to={paths.home} className={`${button.base} ${button.primary} mt-6`}>
        {sharedStrings.backHome}
      </Link>
    </div>
  );
}
