import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { devtoolsStore, initialState } from './store.js';
import { ZerospinDevtools } from './ZerospinDevtools.js';
import { zerospinDevtoolsController } from './zerospinDevtoolsController.js';

describe('ZerospinDevtools imperative open', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    devtoolsStore.setState(initialState, true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it('reuses the mounted shell and resolves each open while it is visible', async () => {
    const loadAnotherShell = vi.fn(() => Promise.resolve());
    const unregisterLoader =
      zerospinDevtoolsController.registerLoader(loadAnotherShell);

    await act(async () => {
      root.render(<ZerospinDevtools />);
      await Promise.resolve();
    });

    const panel = document.querySelector<HTMLElement>(
      'section[aria-label="Zerospin DevTools"]',
    );
    if (panel === null) {
      throw new Error('The directly mounted DevTools shell did not render.');
    }

    expect(panel.style.visibility).toBe('hidden');

    let firstOpen: Promise<void> | null = null;
    let visibilityWhenFirstOpenResolved: string | null = null;
    await act(async () => {
      firstOpen = zerospinDevtoolsController.open();
      void firstOpen.then(() => {
        visibilityWhenFirstOpenResolved = panel.style.visibility;
      });
      await Promise.resolve();
    });
    await firstOpen;

    expect(loadAnotherShell).not.toHaveBeenCalled();
    expect(visibilityWhenFirstOpenResolved).toBe('visible');

    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close Zerospin DevTools"]',
    );
    if (closeButton === null) {
      throw new Error(
        'The mounted DevTools shell did not render its close button.',
      );
    }

    let reopen: Promise<void> | null = null;
    await act(async () => {
      closeButton.click();
      reopen = zerospinDevtoolsController.open();
      await Promise.resolve();
    });
    await reopen;

    expect(panel.style.visibility).toBe('visible');

    unregisterLoader();
  });
});
