import { StrictMode } from 'react';

import { ZerospinRouteErrorBoundary } from '@zerospin/error-boundary/ZerospinRouteErrorBoundary';
import { createRoot } from 'react-dom/client';
import 'react-json-view-lite/dist/index.css';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { RepoExplorer } from './RepoExplorer.js';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '*',
    element: <RepoExplorer />,
    ErrorBoundary: ZerospinRouteErrorBoundary,
  },
]);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing Studio root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
