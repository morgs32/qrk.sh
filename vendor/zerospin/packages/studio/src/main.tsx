import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import 'react-json-view-lite/dist/index.css';

import { RepoExplorer } from './RepoExplorer.js';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '*',
    element: <RepoExplorer />,
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
