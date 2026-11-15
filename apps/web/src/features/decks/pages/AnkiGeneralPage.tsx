// «Opciones» → «Anki general»: the preferences of every deck. An old link with a preset or a deck goes to
// «Configuración de mazos».
import { Navigate, useSearchParams } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { AnkiOptions } from '../components/options/AnkiOptions';

export function AnkiGeneralSettingsPage() {
  const [params] = useSearchParams();
  if (params.has('preset') || params.has('deck')) {
    return <Navigate to={`${paths.deckOptions()}?${params.toString()}`} replace />;
  }
  return <AnkiOptions mode="general" />;
}
