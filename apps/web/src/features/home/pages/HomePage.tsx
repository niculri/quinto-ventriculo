// The home page: the line of «Novedades», first steps, «Hoy», «Seguir», the study heatmap and «Tus ramos». Its sections appear together, in a
// space as tall as the page was the last time on this device, so nothing moves while it loads.

import { useTitle } from '../../../shared/hooks/useTitle';
import { firstName } from '../../../shared/lib/firstName';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { page } from '../../../shared/ui/styles';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { useUser } from '../../session/context';
import { HomeBody } from '../components/HomeBody';
import { NewsLine } from '../../news/components/NewsLine';
import { homePageStrings as s } from './strings/HomePage.strings';

export function HomePage() {
  const user = useUser();
  const catalog = useCatalog();
  useTitle(s.crumb);

  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.crumb }]} />
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {s.hello(firstName(user.name))}
        </h1>
        <p className="mt-1.5 text-muted">{s.question}</p>
      </div>
      <NewsLine />
      {catalog.isError ? (
        <ErrorWithRetry
          error={catalog.error}
          onRetry={() => void catalog.refetch()}
          className="mt-8 max-w-lg"
        />
      ) : (
        <HomeBody catalog={catalog.data} />
      )}
    </div>
  );
}
