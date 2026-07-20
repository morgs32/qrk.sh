import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DevTools theme configuration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses the configured theme instead of a saved theme', async () => {
    window.localStorage.setItem(
      'zerospin_devtools_settings',
      JSON.stringify({ theme: 'dark' }),
    );

    const { getExistingStateFromStorage } = await import('./store.js');
    const state = getExistingStateFromStorage({ theme: 'light' });

    expect(state.settings.theme).toBe('light');
  });

  it('restores the saved theme when the host does not configure one', async () => {
    window.localStorage.setItem(
      'zerospin_devtools_settings',
      JSON.stringify({ theme: 'light' }),
    );

    const { getExistingStateFromStorage } = await import('./store.js');
    const state = getExistingStateFromStorage();

    expect(state.settings.theme).toBe('light');
  });

  it('uses browser preference when neither config nor storage selects a theme', async () => {
    const { getExistingStateFromStorage } = await import('./store.js');
    const state = getExistingStateFromStorage();

    expect(state.settings.theme).toBe('dark');
  });
});
