'use client';

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';

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

function ZerospinDevtoolsMountConfirmation(props: { onMounted: () => void }) {
  const { onMounted } = props;

  useEffect(() => {
    onMounted();
  }, [onMounted]);

  return null;
}

export function ZerospinDevtoolsLoader(props: {
  load?: boolean;
  defaultOpen?: boolean;
}) {
  const { load = false, defaultOpen = false } = props;
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);
  const resolveMountRef = useRef<(() => void) | null>(null);
  const rejectMountRef = useRef<((error: unknown) => void) | null>(null);
  const defaultOpenRef = useRef(defaultOpen);
  defaultOpenRef.current = defaultOpen;

  const tearDownShell = useCallback(() => {
    rootRef.current?.unmount();
    rootRef.current = null;
    hostRef.current?.remove();
    hostRef.current = null;
  }, []);

  const handleZerospinDevtoolsMounted = useCallback(() => {
    const resolve = resolveMountRef.current;
    resolveMountRef.current = null;
    rejectMountRef.current = null;
    resolve?.();
  }, []);

  const handleZerospinDevtoolsMountError = useCallback(
    (error: unknown) => {
      const reject = rejectMountRef.current;
      resolveMountRef.current = null;
      rejectMountRef.current = null;
      loadPromiseRef.current = null;
      tearDownShell();
      reject?.(error);
    },
    [tearDownShell],
  );

  const loadZerospinDevtools = useCallback(() => {
    // Strict Mode re-runs effects on one instance. Share one in-flight load so a
    // cleanup-rejected attempt cannot leave a resolved load with no shell.
    if (loadPromiseRef.current !== null) {
      return loadPromiseRef.current;
    }

    const loadPromise = (async () => {
      const loadedModule = await import('@zerospin/devtools/ZerospinDevtools');
      if (!isMountedRef.current) {
        throw new Error(
          'ZerospinApp.Provider unmounted before Zerospin DevTools finished loading.',
        );
      }

      // Mount outside the app tree so MemoryRouter is not nested under the host
      // app's RouterProvider / BrowserRouter.
      await new Promise<void>((resolve, reject) => {
        resolveMountRef.current = resolve;
        rejectMountRef.current = reject;

        tearDownShell();

        const host = document.createElement('div');
        host.setAttribute('data-zerospin-devtools-host', '');
        document.body.appendChild(host);
        hostRef.current = host;

        const root = createRoot(host);
        rootRef.current = root;
        root.render(
          <ZerospinDevtoolsMountBoundary
            onError={handleZerospinDevtoolsMountError}
          >
            <loadedModule.ZerospinDevtools
              config={{ defaultOpen: defaultOpenRef.current }}
            />
            <ZerospinDevtoolsMountConfirmation
              onMounted={handleZerospinDevtoolsMounted}
            />
          </ZerospinDevtoolsMountBoundary>,
        );
      });
    })();

    loadPromiseRef.current = loadPromise;
    void loadPromise.then(
      () => undefined,
      () => {
        if (loadPromiseRef.current === loadPromise) {
          loadPromiseRef.current = null;
        }
        tearDownShell();
      },
    );

    return loadPromise;
  }, [
    handleZerospinDevtoolsMountError,
    handleZerospinDevtoolsMounted,
    tearDownShell,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    const unregisterLoader =
      zerospinDevtoolsController.registerLoader(loadZerospinDevtools);
    window.zerospin ??= {};
    const zerospinNamespace = window.zerospin;
    const previousDevtools = zerospinNamespace.devtools;
    const devtools = { open: zerospinDevtoolsController.open };
    zerospinNamespace.devtools = devtools;

    // Eager mount keeps the floating trigger available without a console open().
    if (load) {
      void loadZerospinDevtools().catch(error => {
        console.error('Failed to load Zerospin DevTools', error);
      });
    }

    return () => {
      isMountedRef.current = false;
      unregisterLoader();
      loadPromiseRef.current = null;
      const reject = rejectMountRef.current;
      resolveMountRef.current = null;
      rejectMountRef.current = null;
      reject?.(
        new Error(
          'ZerospinApp.Provider unmounted before Zerospin DevTools finished mounting.',
        ),
      );
      tearDownShell();
      if (
        window.zerospin === zerospinNamespace &&
        zerospinNamespace.devtools === devtools
      ) {
        if (previousDevtools === undefined) {
          delete zerospinNamespace.devtools;
        } else {
          zerospinNamespace.devtools = previousDevtools;
        }
      }
    };
  }, [load, loadZerospinDevtools, tearDownShell]);

  return null;
}
