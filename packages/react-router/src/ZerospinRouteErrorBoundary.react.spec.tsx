import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ZerospinError } from '@zerospin/error';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZerospinRouteErrorBoundary } from './ZerospinRouteErrorBoundary.js';

const writeText = vi.fn().mockResolvedValue(undefined);

function renderThrown(error: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      ErrorBoundary: ZerospinRouteErrorBoundary,
      Component: () => {
        throw error;
      },
    },
  ]);

  render(<RouterProvider router={router} onError={vi.fn()} />);
}

describe('ZerospinRouteErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders and copies complete Zerospin diagnostics', async () => {
    const error = new ZerospinError({
      code: 'aggregate-catch-up-pending',
      message: 'Aggregate subscription has not reached its replay bound.',
      status: 425,
      extra: { expectedIndex: 41, actualIndex: 40 },
      cause: 'Delivery stopped at block 40.',
    });
    error.stack = 'ZerospinError: catch-up pending\n    at getState.ts:301:15';

    renderThrown(error);

    expect(
      await screen.findByRole('alert', { name: 'ZerospinError' }),
    ).not.toBeNull();
    expect(screen.getByText('aggregate-catch-up-pending')).not.toBeNull();
    expect(screen.getByText('Status 425')).not.toBeNull();
    expect(document.body.textContent).toContain('expectedIndex');
    expect(document.body.textContent).toContain(
      'Delivery stopped at block 40.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }));

    expect(await screen.findByText('Copied')).not.toBeNull();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(JSON.parse(String(writeText.mock.calls[0]?.[0]))).toEqual({
      tag: 'ZerospinError',
      code: 'aggregate-catch-up-pending',
      message: 'Aggregate subscription has not reached its replay bound.',
      status: 425,
      extra: { expectedIndex: 41, actualIndex: 40 },
      cause: 'Delivery stopped at block 40.',
      stack: 'ZerospinError: catch-up pending\n    at getState.ts:301:15',
    });
  });

  it('renders an ordinary Error and toggles its details', async () => {
    const error = new RangeError('Inventory index is outside the local range.');
    error.stack = 'RangeError: outside range\n    at InventoryRoute.tsx:12:3';

    renderThrown(error);

    expect(
      await screen.findByRole('alert', { name: 'RangeError' }),
    ).not.toBeNull();
    const details = screen
      .getByText('Hide diagnostic details')
      .closest('details');
    expect(details?.open).toBe(true);

    fireEvent.click(screen.getByText('Hide diagnostic details'));

    await waitFor(() => expect(details?.open).toBe(false));
    expect(await screen.findByText('Show diagnostic details')).not.toBeNull();
  });

  it('renders a React Router error response', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        ErrorBoundary: ZerospinRouteErrorBoundary,
        loader: () => {
          throw new Response(JSON.stringify({ reason: 'maintenance' }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' },
          });
        },
        Component: () => null,
      },
    ]);

    render(<RouterProvider router={router} onError={vi.fn()} />);

    expect(
      await screen.findByRole('alert', { name: 'RouteErrorResponse' }),
    ).not.toBeNull();
    expect(screen.getByText('503 Service Unavailable')).not.toBeNull();
    expect(screen.getByText('Status 503')).not.toBeNull();
    expect(document.body.textContent).toContain('maintenance');
  });

  it('renders an unknown thrown value', async () => {
    renderThrown('unknown failure');

    expect(
      await screen.findByRole('alert', { name: 'Unknown thrown value' }),
    ).not.toBeNull();
    expect(screen.getByText('unknown failure')).not.toBeNull();
    expect(document.body.textContent).toContain('Diagnostic payload');
  });

  it('reports clipboard failure', async () => {
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
    renderThrown(new Error('Copy this diagnostic.'));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Copy diagnostics' }),
    );

    expect(await screen.findByText('Copy failed')).not.toBeNull();
  });

  it('reloads the application', async () => {
    renderThrown(new Error('Reload this route.'));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reload application' }),
    );
  });
});
