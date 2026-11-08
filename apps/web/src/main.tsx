import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Providers } from './app/Providers';
import { routes } from './app/routes';
import { createServices } from './app/services';
import './styles.css';

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers services={createServices()}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
