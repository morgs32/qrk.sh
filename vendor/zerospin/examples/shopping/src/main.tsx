import { StrictMode, Suspense } from 'react';

import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import { ZerospinRouteErrorBoundary } from '@zerospin/error-boundary/ZerospinRouteErrorBoundary';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { AppUpdateDialog } from '@/components/AppUpdateDialog';
import { AuthenticatedRoute } from '@/routes/AuthenticatedRoute';
import { ProductRoute } from '@/routes/ProductRoute.client';
import { RootRoute } from '@/routes/RootRoute';
import { ShoppingRoute } from '@/routes/ShoppingRoute';
import { SignInRoute } from '@/routes/SignInRoute';
import { SignUpRoute } from '@/routes/SignUpRoute';

import './styles.css';

const router = createBrowserRouter([
  {
    element: <RootRoute />,
    children: [
      {
        path: '/signin/*',
        element: <SignInRoute />,
      },
      {
        path: '/signup/*',
        element: <SignUpRoute />,
      },
      {
        element: <AuthenticatedRoute />,
        ErrorBoundary: ZerospinRouteErrorBoundary,
        children: [
          {
            path: '/',
            element: <ShoppingRoute />,
          },
          {
            path: '/products/:productId',
            element: <ProductRoute />,
          },
        ],
      },
    ],
  },
]);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing shopping root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppUpdateDialog />
    <Suspense fallback={null}>
      <RouterProvider router={router} />
    </Suspense>
  </StrictMode>,
);
