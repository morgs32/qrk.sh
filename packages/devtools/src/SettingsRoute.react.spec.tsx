import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SettingsRoute } from './SettingsRoute.js';
import { devtoolsStore, initialState } from './store.js';

describe('SettingsRoute theme control', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    devtoolsStore.setState(initialState, true);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it('shows the theme selector when the host does not configure a theme', async () => {
    await act(async () => {
      root.render(<SettingsRoute />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Theme');
    expect(
      container.querySelector('select option[value="dark"]'),
    ).not.toBeNull();
  });

  it('hides the theme selector when the host locks the theme', async () => {
    await act(async () => {
      root.render(<SettingsRoute configuredTheme="light" />);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Theme');
    expect(container.querySelector('select option[value="dark"]')).toBeNull();
  });

  it('does not expose URL-gate configuration', async () => {
    await act(async () => {
      root.render(<SettingsRoute />);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('URL Configuration');
    expect(container.textContent).not.toContain('Require URL flag');
  });
});
