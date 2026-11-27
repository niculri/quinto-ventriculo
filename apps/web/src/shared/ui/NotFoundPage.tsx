// The 404 page, in the frame of every page: «Inicio › No encontrado», the title where the others have it and the way
// home. The same for an address made up and for something not published.
import { Link } from 'react-router';
import { useTitle } from '../hooks/useTitle';
import { paths } from '../lib/paths';
import { Breadcrumbs } from './Breadcrumbs';
import { button, page } from './styles';
import { notFoundPageStrings as s } from './strings/NotFoundPage.strings';
import { sharedStrings } from '../strings/shared.strings';

export function NotFoundPage() {
  useTitle(s.notFound.tab);
  return (
    <div className={page}>
      <Breadcrumbs
        items={[{ label: s.notFound.home, to: paths.home }, { label: s.notFound.tab }]}
      />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{s.notFound.title}</h1>
      <p className="mt-2 text-muted">{s.notFound.body}</p>
      <Link to={paths.home} className={`${button.base} ${button.primary} mt-6`}>
        {sharedStrings.backHome}
      </Link>
    </div>
  );
}
