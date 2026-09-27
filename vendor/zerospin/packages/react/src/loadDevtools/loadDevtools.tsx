import { Component, useLayoutEffect, type ReactNode } from 'react';

import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  interface Window {
    zerospin?: {
      devtools?: {
        open(): Promise<void>;
      };
    };
  }
}

class ZerospinDevtoolsMountBoundary extends Component<
  {
    children: ReactNode;
    onError: (error: unknown) => void;
  },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function MountConfirmation(props: { onMounted: () => void }) {
  const { onMounted } = props;
  useLayoutEffect(() => {
    onMounted();
  }, [onMounted]);
  return null;
}

/**
 * Imperative DevTools load. Mounts the UI in its own DOM host/root, independent
 * of the application React tree and session lifetimes.
 */
export async function loadDevtools(props?: { defaultOpen?: boolean }): Promise<{
  open(): Promise<void>;
  dispose(): void;
}> {
  const defaultOpen = props?.defaultOpen === true;
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  let disposed = false;

  const tearDownShell = () => {
    root?.unmount();
    root = null;
    host?.remove();
    host = null;
  };

  const loadShell = () =>
    new Promise<void>((resolve, reject) => {
      void (async () => {
        try {
          const loadedModule =
            await import('@zerospin/devtools/ZerospinDevtools');
          // Resolve the export before creating a root so a failed chunk never
          // mounts React (lazy getters / broken exports throw here).
          const Devtools = loadedModule.ZerospinDevtools;
          if (disposed) {
            reject(new Error('DevTools disposed before loading finished.'));
            return;
          }

          tearDownShell();

          const nextHost = document.createElement('div');
          nextHost.setAttribute('data-zerospin-devtools-host', '');
          document.body.appendChild(nextHost);
          host = nextHost;

          let settled = false;
          const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
          };

          const failLoad = (error: unknown) => {
            // Reject first; never unmount synchronously inside React's render /
            // onCaughtError path (React 19 races and can strand the load promise).
            settle(() => reject(error));
            void Promise.resolve().then(() => {
              tearDownShell();
            });
          };

          const nextRoot = createRoot(nextHost, {
            onCaughtError: failLoad,
          });
          root = nextRoot;

          nextRoot.render(
            <ZerospinDevtoolsMountBoundary onError={failLoad}>
              <div>
                <Devtools config={{ defaultOpen }} />
                <MountConfirmation onMounted={() => settle(() => resolve())} />
              </div>
            </ZerospinDevtoolsMountBoundary>,
          );
        } catch (error) {
          tearDownShell();
          reject(error);
        }
      })();
    });

  const unregisterLoader = zerospinDevtoolsController.registerLoader(loadShell);

  window.zerospin ??= {};
  const zerospinNamespace = window.zerospin;
  const previousDevtools = zerospinNamespace.devtools;
  const consoleApi = { open: zerospinDevtoolsController.open };
  zerospinNamespace.devtools = consoleApi;

  try {
    await loadShell();
  } catch (error) {
    unregisterLoader();
    if (
      window.zerospin === zerospinNamespace &&
      zerospinNamespace.devtools === consoleApi
    ) {
      if (previousDevtools === undefined) {
        delete zerospinNamespace.devtools;
      } else {
        zerospinNamespace.devtools = previousDevtools;
      }
    }
    throw error;
  }

  return {
    open: () => zerospinDevtoolsController.open(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unregisterLoader();
      tearDownShell();
      if (
        window.zerospin === zerospinNamespace &&
        zerospinNamespace.devtools === consoleApi
      ) {
        if (previousDevtools === undefined) {
          delete zerospinNamespace.devtools;
        } else {
          zerospinNamespace.devtools = previousDevtools;
        }
      }
    },
  };
}
