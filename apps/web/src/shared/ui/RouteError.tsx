// The notice shown when a page crashes, instead of React Router's own; for example, a part of the web that a new
// version removed, which reloading fixes.
import { useEffect } from 'react';
import { paths } from '../lib/paths';
import { useRouteError } from 'react-router';
import { Notice } from './Notice';
import { button } from './styles';
import { routeErrorStrings } from './strings/RouteError.strings';
import { sharedStrings } from '../strings/shared.strings';

export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Notice title={routeErrorStrings.routeError.title}>
        <p>{routeErrorStrings.routeError.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            // v8 ignore next: jsdom cannot reload, and its `location` cannot be spied on (unforgeable).
            onClick={() => window.location.reload()}
            className={`${button.base} ${button.secondary}`}
          >
            {routeErrorStrings.routeError.reload}
          </button>
          <a href={paths.home} className={`${button.base} ${button.ghost}`}>
            {sharedStrings.backHome}
          </a>
        </div>
      </Notice>
    </div>
  );
}
