// @vitest-environment jsdom

import { act } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateDialog } from '@/components/AppUpdateDialog';

const updateServiceWorker = vi.hoisted(() => vi.fn());

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [true, vi.fn()],
    updateServiceWorker,
  }),
}));

describe('AppUpdateDialog', () => {
  beforeEach(() => {
    updateServiceWorker.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('enables Refresh now only while navigator is online', () => {
    let isOnline = false;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => isOnline);

    render(<AppUpdateDialog />);

    const refreshButton = screen.getByRole('button', {
      name: 'Refresh now',
    });
    expect(refreshButton).toHaveProperty('disabled', true);

    fireEvent.click(refreshButton);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    isOnline = true;
    act(() => window.dispatchEvent(new Event('online')));

    expect(refreshButton).toHaveProperty('disabled', false);
    fireEvent.click(refreshButton);
    expect(updateServiceWorker).toHaveBeenCalledOnce();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);

    isOnline = false;
    fireEvent.click(refreshButton);
    expect(updateServiceWorker).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new Event('offline')));

    expect(refreshButton).toHaveProperty('disabled', true);
  });
});
