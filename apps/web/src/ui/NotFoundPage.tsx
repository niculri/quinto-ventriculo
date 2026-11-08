import { Link } from 'react-router';
import { paths } from '../app/paths';
import { button } from './styles';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="font-serif text-6xl font-semibold text-brand">404</p>
      <h1 className="mt-4 text-xl font-semibold">Esta página no aparece ni en el Netter</h1>
      <p className="mt-2 text-muted">
        Puede que el enlace esté mal escrito o que el apunte haya cambiado de lugar.
      </p>
      <Link to={paths.home} className={`${button.base} ${button.primary} mt-6`}>
        Volver al inicio
      </Link>
    </div>
  );
}
