import { useEffect } from 'react';
import { paths } from '../app/paths';
import { useRouteError } from 'react-router';
import { Notice } from './Notice';
import { button } from './styles';

/**
 * What is shown if a page crashes (instead of React Router's «Unexpected Application Error»). It happens, for
 * example, if after a new version is published the browser asks for a part of the web that no longer exists:
 * reloading fixes it.
 */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Notice title="Algo salió mal">
        <p>Recarga la página. Si sigue pasando, vuelve al inicio.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`${button.base} ${button.secondary}`}
          >
            Recargar
          </button>
          <a href={paths.home} className={`${button.base} ${button.ghost}`}>
            Volver al inicio
          </a>
        </div>
      </Notice>
    </div>
  );
}
