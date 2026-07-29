import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';

import {
  BrowserPartitionControllerContext,
  makeBrowserPartitionController,
} from './makeBrowserPartitionController';
import type { IReactFrontend, IReactServiceFrontend } from './types';

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

function ZerospinDevtoolsMountConfirmation(props: {
  onMounted: () => void;
}) {
  const { onMounted } = props;

  useEffect(() => {
    onMounted();
  }, [onMounted]);

  return null;
}

type IFrontendAuthenticator =
  | Readonly<{
      frontend: Pick<
        IReactFrontend<IFrontendController>,
        'kind' | 'frontend' | 'sessionRuntime'
      >;
      generateSignature: ISignatureFactory;
    }>
  | Readonly<{
      frontend: Pick<
        IReactServiceFrontend<IServiceFrontendController>,
        'kind' | 'frontend' | 'sessionRuntime'
      >;
      generateSignature: ISignatureFactory;
    }>;

type ICheckedFrontendAuthenticators<
  FRONTEND_AUTHENTICATORS extends Readonly<
    Record<string, IFrontendAuthenticator>
  >,
> = {
  readonly [FRONTEND_NAME in keyof FRONTEND_AUTHENTICATORS]: FRONTEND_AUTHENTICATORS[FRONTEND_NAME]['frontend']['frontend']['frontendName'] extends FRONTEND_NAME
    ? FRONTEND_AUTHENTICATORS[FRONTEND_NAME]
    : never;
};

export function ZerospinConfig<
  FRONTEND_AUTHENTICATORS extends Readonly<
    Record<string, IFrontendAuthenticator>
  >,
>(props: {
  partitionKey: string;
  isSharedWorkerEnabled?: boolean;
  frontendAuthenticators: FRONTEND_AUTHENTICATORS &
    ICheckedFrontendAuthenticators<FRONTEND_AUTHENTICATORS>;
  children: ReactNode;
}) {
  const {
    children,
    frontendAuthenticators,
    partitionKey,
    isSharedWorkerEnabled = false,
  } = props;
  const [LoadedZerospinDevtools, setLoadedZerospinDevtools] =
    useState<ComponentType | null>(null);
  const loadedZerospinDevtoolsRef = useRef<ComponentType | null>(null);
  const isMountedRef = useRef(false);
  const resolveMountRef = useRef<(() => void) | null>(null);
  const rejectMountRef = useRef<((error: unknown) => void) | null>(null);

  for (const [frontendName, authenticator] of Object.entries(
    frontendAuthenticators,
  )) {
    if (authenticator.frontend.frontend.frontendName !== frontendName) {
      throw new Error(
        `ZerospinConfig frontendAuthenticators key "${frontendName}" must equal frontendName "${authenticator.frontend.frontend.frontendName}".`,
      );
    }
  }

  const frontendAuthenticatorsRef = useRef(frontendAuthenticators);
  frontendAuthenticatorsRef.current = frontendAuthenticators;
  const pendingControllerReleaseRef = useRef<{
    controller: ReturnType<typeof makeBrowserPartitionController>;
    isCanceled: boolean;
  } | null>(null);

  const browserPartitionController = useMemo(
    () =>
      makeBrowserPartitionController({
        partitionKey,
        isSharedWorkerEnabled,
        getFrontendAuthenticator: frontendName =>
          frontendAuthenticatorsRef.current[frontendName],
      }),
    [partitionKey, isSharedWorkerEnabled],
  );

  /*
   * 1. Import the DevTools React shell only after the console API requests it.
   * 2. Keep the mount Promise pending until the loaded subtree commits.
   * 3. Reject an import that finishes after its owning configuration unmounts.
   */
  const loadZerospinDevtools = useCallback(async () => {
    if (loadedZerospinDevtoolsRef.current !== null) {
      return;
    }

    const loadedModule = await import(
      '@zerospin/devtools/ZerospinDevtools'
    );

    if (!isMountedRef.current) {
      throw new Error(
        'ZerospinConfig unmounted before Zerospin DevTools finished loading.',
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

  /*
   * 1. Register this configuration as the one lazy DevTools shell owner.
   * 2. Add only the narrow open method to the existing Zerospin window namespace.
   * 3. Restore the exact previous property and reject pending work on cleanup.
   */
  useEffect(() => {
    isMountedRef.current = true;
    const unregisterLoader =
      zerospinDevtoolsController.registerLoader(loadZerospinDevtools);

    if (window.zerospin === undefined) {
      window.zerospin = {};
    }

    const zerospinNamespace = window.zerospin;
    const previousDevtools = zerospinNamespace.devtools;
    const devtools = {
      open: zerospinDevtoolsController.open,
    };
    zerospinNamespace.devtools = devtools;

    return () => {
      isMountedRef.current = false;
      unregisterLoader();

      const reject = rejectMountRef.current;
      resolveMountRef.current = null;
      rejectMountRef.current = null;
      reject?.(
        new Error(
          'ZerospinConfig unmounted before Zerospin DevTools finished mounting.',
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

  useEffect(() => {
    const pendingRelease = pendingControllerReleaseRef.current;
    if (pendingRelease?.controller === browserPartitionController) {
      pendingRelease.isCanceled = true;
      pendingControllerReleaseRef.current = null;
    }

    return () => {
      const releaseRequest = {
        controller: browserPartitionController,
        isCanceled: false,
      };
      pendingControllerReleaseRef.current = releaseRequest;
      queueMicrotask(() => {
        if (releaseRequest.isCanceled) {
          return;
        }
        if (pendingControllerReleaseRef.current === releaseRequest) {
          pendingControllerReleaseRef.current = null;
        }
        void releaseRequest.controller.release();
      });
    };
  }, [browserPartitionController]);

  return (
    <BrowserPartitionControllerContext.Provider
      value={browserPartitionController}
    >
      {children}
      {LoadedZerospinDevtools === null ? null : (
        <ZerospinDevtoolsMountBoundary
          onError={handleZerospinDevtoolsMountError}
        >
          <LoadedZerospinDevtools />
          <ZerospinDevtoolsMountConfirmation
            onMounted={handleZerospinDevtoolsMounted}
          />
        </ZerospinDevtoolsMountBoundary>
      )}
    </BrowserPartitionControllerContext.Provider>
  );
}
