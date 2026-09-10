// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { ZerospinRouteErrorBoundary } from '@zerospin/error-boundary/ZerospinRouteErrorBoundary';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Shopping route error boundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the shared boundary for an authenticated route failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      {
        path: '/',
        ErrorBoundary: ZerospinRouteErrorBoundary,
        Component: () => {
          throw new Error('Shopping route failed.');
        },
      },
    ]);

    render(<RouterProvider router={router} onError={vi.fn()} />);

    expect(await screen.findByRole('alert', { name: 'Error' })).not.toBeNull();
    expect(screen.getByText('Shopping route failed.')).not.toBeNull();
  });
});
