// The web's entry point: mounts the router inside the providers.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Providers } from './app/Providers';
import { routes } from './app/routes';
import { createServices } from './app/services';
import { ROOT_ERROR_HANDLERS } from './shared/lib/reportError';
import './styles.css';

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!, ROOT_ERROR_HANDLERS).render(
  <StrictMode>
    <Providers services={createServices()}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
