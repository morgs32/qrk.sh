import { StrictMode } from 'react';

import { act, cleanup, render, screen } from '@testing-library/react';
import { loadDevtools } from '@zerospin/react/loadDevtools/loadDevtools';
import { ZerospinDevtoolsLoader } from '@zerospin/react/ZerospinDevtoolsLoader';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zerospin/react/loadDevtools/loadDevtools');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const devtools = {
  open: async () => undefined,
  dispose: vi.fn(),
};

beforeEach(() => {
  vi.mocked(loadDevtools).mockReset().mockResolvedValue(devtools);
  devtools.dispose.mockClear();
});

afterEach(cleanup);

async function finishImport() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

describe('ZerospinDevtoolsLoader lifecycle', () => {
  it('renders nothing on the server without loading DevTools', async () => {
    expect(renderToString(<ZerospinDevtoolsLoader />)).toBe('');
    await finishImport();

    expect(loadDevtools).not.toHaveBeenCalled();
    expect(devtools.dispose).not.toHaveBeenCalled();
  });

  it('leaves one surviving load after StrictMode effect replay', async () => {
    const mounted = render(
      <StrictMode>
        <ZerospinDevtoolsLoader />
      </StrictMode>,
    );
    await finishImport();

    expect(loadDevtools).toHaveBeenCalledExactlyOnceWith({
      defaultOpen: false,
    });
    expect(devtools.dispose).not.toHaveBeenCalled();

    mounted.unmount();
    expect(devtools.dispose).toHaveBeenCalledTimes(1);
  });

  it('cancels a mount removed before the delayed import settles', async () => {
    const mounted = render(<ZerospinDevtoolsLoader />);
    mounted.unmount();
    await finishImport();

    expect(loadDevtools).not.toHaveBeenCalled();
    expect(devtools.dispose).not.toHaveBeenCalled();
  });

  /*
   * 1. Admit the lazy load while its returned DevTools capability is pending.
   * 2. Remove the owner before that capability arrives.
   * 3. Dispose the late result instead of retaining an unowned DevTools host.
   */
  it('disposes a pending load that completes after unmount', async () => {
    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof loadDevtools>>>();
    vi.mocked(loadDevtools).mockReturnValueOnce(pending.promise);

    // 1 — The import can finish without resolving the admitted load itself.
    const mounted = render(<ZerospinDevtoolsLoader />);
    await finishImport();
    expect(loadDevtools).toHaveBeenCalledTimes(1);
    expect(devtools.dispose).not.toHaveBeenCalled();

    // 2 — No capability exists to dispose yet.
    mounted.unmount();
    expect(devtools.dispose).not.toHaveBeenCalled();

    // 3 — Completing the load releases its newly available capability once.
    await act(async () => {
      pending.resolve(devtools);
      await pending.promise;
    });
    expect(devtools.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains a successful load until its owner unmounts', async () => {
    const mounted = render(<ZerospinDevtoolsLoader defaultOpen />);
    await finishImport();

    expect(loadDevtools).toHaveBeenCalledExactlyOnceWith({
      defaultOpen: true,
    });
    expect(devtools.dispose).not.toHaveBeenCalled();

    mounted.rerender(<ZerospinDevtoolsLoader defaultOpen />);
    expect(loadDevtools).toHaveBeenCalledTimes(1);
    expect(devtools.dispose).not.toHaveBeenCalled();

    mounted.unmount();
    expect(devtools.dispose).toHaveBeenCalledTimes(1);
  });

  /*
   * 1. Preserve the initial open preference through a rerender before loading.
   * 2. Ignore later preference changes within the same mounted lifetime.
   * 3. Apply a fresh initial preference to a new owner after unmount.
   */
  it('captures defaultOpen per mount and applies new defaults on remount', async () => {
    const nextDevtools = {
      open: async () => undefined,
      dispose: vi.fn(),
    };
    vi.mocked(loadDevtools)
      .mockResolvedValueOnce(devtools)
      .mockResolvedValueOnce(nextDevtools);

    // 1 — Loading receives the mount's original preference.
    const mounted = render(<ZerospinDevtoolsLoader defaultOpen />);
    mounted.rerender(<ZerospinDevtoolsLoader defaultOpen={false} />);
    await finishImport();
    expect(loadDevtools).toHaveBeenNthCalledWith(1, {
      defaultOpen: true,
    });

    // 2 — Changing a default does not reload or release the existing host.
    mounted.rerender(<ZerospinDevtoolsLoader defaultOpen={false} />);
    await finishImport();
    expect(loadDevtools).toHaveBeenCalledTimes(1);
    expect(devtools.dispose).not.toHaveBeenCalled();
    mounted.unmount();
    expect(devtools.dispose).toHaveBeenCalledTimes(1);

    // 3 — A distinct owner receives the newly supplied initial preference.
    const remounted = render(<ZerospinDevtoolsLoader defaultOpen={false} />);
    await finishImport();
    expect(loadDevtools).toHaveBeenNthCalledWith(2, {
      defaultOpen: false,
    });
    expect(nextDevtools.dispose).not.toHaveBeenCalled();
    remounted.unmount();
    expect(nextDevtools.dispose).toHaveBeenCalledTimes(1);
    expect(devtools.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected load while leaving application content mounted', async () => {
    const failure = new Error('DevTools chunk unavailable');
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadDevtools).mockRejectedValueOnce(failure);

    const mounted = render(
      <main>
        <ZerospinDevtoolsLoader />
        <p>Public route content</p>
      </main>,
    );
    await finishImport();

    expect(screen.getByText('Public route content')).toBeTruthy();
    expect(report).toHaveBeenCalledExactlyOnceWith(
      'Failed to load Zerospin DevTools',
      failure,
    );
    expect(devtools.dispose).not.toHaveBeenCalled();
    mounted.unmount();
    expect(devtools.dispose).not.toHaveBeenCalled();
  });
});
