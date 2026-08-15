// @vitest-environment jsdom

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

import { ShoppingErrorBoundary } from '@/routes/ShoppingErrorBoundary';

const writeText = vi.fn().mockResolvedValue(undefined);

describe('ShoppingErrorBoundary', () => {
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
    const message =
      'AggregateFrontendRepo cannot register readiness before its direct aggregate subscription reaches the replay bound';
    const cause = 'Aggregate subscription delivery stopped at block 40.';
    const stack = `${message}\n    at getState (getState.ts:301:15)`;
    const extra = {
      expectedLastAggregateCursor: 'cur_expected',
      actualLastAggregateCursor: 'cur_actual',
      expectedAggregateIndex: 41,
      actualAggregateIndex: 40,
    };
    const error = new ZerospinError({
      code: 'aggregate-frontend-state-aggregate-catch-up-pending',
      message,
      status: 425,
      extra,
      cause,
    });
    error.stack = stack;
    const router = createMemoryRouter([
      {
        path: '/',
        ErrorBoundary: ShoppingErrorBoundary,
        Component: () => {
          throw error;
        },
      },
    ]);

    render(<RouterProvider router={router} onError={vi.fn()} />);

    expect(
      await screen.findByRole('alert', { name: 'ZerospinError' }),
    ).not.toBeNull();
    expect(
      screen.getByText('aggregate-frontend-state-aggregate-catch-up-pending'),
    ).not.toBeNull();
    expect(screen.getByText(message)).not.toBeNull();
    expect(screen.getByText('Status 425')).not.toBeNull();
    expect(document.body.textContent).toContain('expectedLastAggregateCursor');
    expect(document.body.textContent).toContain('cur_expected');
    expect(document.body.textContent).toContain('actualLastAggregateCursor');
    expect(document.body.textContent).toContain('cur_actual');
    expect(document.body.textContent).toContain('expectedAggregateIndex');
    expect(document.body.textContent).toContain('41');
    expect(document.body.textContent).toContain('actualAggregateIndex');
    expect(document.body.textContent).toContain('40');
    expect(screen.getByText(cause)).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Stack' }).closest('section')
        ?.textContent,
    ).toContain(stack);

    const summary = screen.getByText('Hide diagnostic details');
    expect(summary.closest('details')?.open).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Reload application' }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }));

    expect(await screen.findByText('Copied')).not.toBeNull();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedDiagnostics = writeText.mock.calls[0]?.[0];
    expect(copiedDiagnostics).toEqual(expect.any(String));
    if (typeof copiedDiagnostics !== 'string') {
      throw new Error('Expected copied diagnostics to be JSON text.');
    }
    expect(JSON.parse(copiedDiagnostics)).toEqual({
      tag: 'ZerospinError',
      code: 'aggregate-frontend-state-aggregate-catch-up-pending',
      message,
      status: 425,
      extra,
      cause,
      stack,
    });

    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
    fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
    expect(await screen.findByText('Copy failed')).not.toBeNull();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('renders an ordinary Error with its name, message, and stack', async () => {
    const error = new RangeError('Inventory index is outside the local range.');
    const stack = `${error.name}: ${error.message}\n    at InventoryRoute (InventoryRoute.tsx:12:3)`;
    error.stack = stack;
    const router = createMemoryRouter([
      {
        path: '/',
        ErrorBoundary: ShoppingErrorBoundary,
        Component: () => {
          throw error;
        },
      },
    ]);

    render(<RouterProvider router={router} onError={vi.fn()} />);

    expect(
      await screen.findByRole('alert', { name: 'RangeError' }),
    ).not.toBeNull();
    expect(screen.getByText(error.message)).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Stack' }).closest('section')
        ?.textContent,
    ).toContain(stack);
  });

  it('renders a React Router error response with its response data', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        ErrorBoundary: ShoppingErrorBoundary,
        loader: () => {
          throw new Response(
            JSON.stringify({
              code: 'catalog-unavailable',
              reason: 'maintenance',
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' },
            },
          );
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
    expect(
      screen.getByText('React Router returned an error response.'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain('catalog-unavailable');
    expect(document.body.textContent).toContain('maintenance');
  });
});
