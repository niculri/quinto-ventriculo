// The home page: first steps, «Hoy», «Seguir», the study heatmap and «Tus ramos». Its sections appear together, in a
// space as tall as the page was the last time on this device, so nothing moves while it loads.

import { firstName } from '../../../shared/lib/firstName';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { page } from '../../../shared/ui/styles';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { useUser } from '../../session/context';
import { HomeBody } from '../components/HomeBody';
import { homeStrings as s } from '../strings';

export function HomePage() {
  const user = useUser();
  const catalog = useCatalog();

  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: s.crumb }]} />
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {s.hello(firstName(user.name))}
        </h1>
        <p className="mt-1.5 text-muted">{s.question}</p>
      </div>
      {catalog.isError ? (
        <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : (
        <HomeBody catalog={catalog.data} />
      )}
    </div>
  );
}
