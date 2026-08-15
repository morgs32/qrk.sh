'use client';

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

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

export function ZerospinDevtoolsLoader() {
  const [LoadedZerospinDevtools, setLoadedZerospinDevtools] =
    useState<ComponentType | null>(null);
  const loadedZerospinDevtoolsRef = useRef<ComponentType | null>(null);
  const isMountedRef = useRef(false);
  const resolveMountRef = useRef<(() => void) | null>(null);
  const rejectMountRef = useRef<((error: unknown) => void) | null>(null);

  const loadZerospinDevtools = useCallback(async () => {
    if (loadedZerospinDevtoolsRef.current !== null) return;
    const loadedModule = await import('@zerospin/devtools/ZerospinDevtools');
    if (!isMountedRef.current) {
      throw new Error(
        'ZerospinApp.Provider unmounted before Zerospin DevTools finished loading.',
      );
    }
    loadedZerospinDevtoolsRef.current = loadedModule.ZerospinDevtools;
    await new Promise<void>((resolve, reject) => {
      resolveMountRef.current = resolve;
      rejectMountRef.current = reject;
      setLoadedZerospinDevtools(() => loadedModule.ZerospinDevtools);
    });
  }, []);

  const handleZerospinDevtoolsMounted = useCallback(() => {
    const resolve = resolveMountRef.current;
    resolveMountRef.current = null;
    rejectMountRef.current = null;
    resolve?.();
  }, []);

  const handleZerospinDevtoolsMountError = useCallback((error: unknown) => {
    const reject = rejectMountRef.current;
    resolveMountRef.current = null;
    rejectMountRef.current = null;
    loadedZerospinDevtoolsRef.current = null;
    setLoadedZerospinDevtools(null);
    reject?.(error);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const unregisterLoader =
      zerospinDevtoolsController.registerLoader(loadZerospinDevtools);
    window.zerospin ??= {};
    const zerospinNamespace = window.zerospin;
    const previousDevtools = zerospinNamespace.devtools;
    const devtools = { open: zerospinDevtoolsController.open };
    zerospinNamespace.devtools = devtools;

    return () => {
      isMountedRef.current = false;
      unregisterLoader();
      const reject = rejectMountRef.current;
      resolveMountRef.current = null;
      rejectMountRef.current = null;
      reject?.(
        new Error(
          'ZerospinApp.Provider unmounted before Zerospin DevTools finished mounting.',
        ),
      );
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
  }, [loadZerospinDevtools]);

  return LoadedZerospinDevtools === null ? null : (
    <ZerospinDevtoolsMountBoundary onError={handleZerospinDevtoolsMountError}>
      <LoadedZerospinDevtools />
      <ZerospinDevtoolsMountConfirmation
        onMounted={handleZerospinDevtoolsMounted}
      />
    </ZerospinDevtoolsMountBoundary>
  );
}
