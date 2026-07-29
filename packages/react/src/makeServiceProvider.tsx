import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Context,
  type ReactNode,
} from 'react';

import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import type { IAnyError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { Effect, type ManagedRuntime } from 'effect';
import useSWRImmutable from 'swr/immutable';
import { useStore } from 'zustand/react';

import { bootstrapBrowserServiceSession } from './bootstrapBrowserServiceSession';
import { BrowserPartitionControllerContext } from './makeBrowserPartitionController';
import type {
  IBrowserServiceSession,
  IReactServiceSessionContext,
} from './types';

export function makeServiceProvider<
  FRONTEND extends IServiceFrontendController,
>(props: {
  ReactContext: Context<IReactServiceSessionContext<FRONTEND> | null>;
  sessionRuntime: ManagedRuntime.ManagedRuntime<
    Async | CuidFactory | MonotonicFactory | PublishableKey | ZerospinApisUrl,
    IAnyError
  >;
  frontend: FRONTEND;
}) {
  const { ReactContext, sessionRuntime, frontend } = props;

  return forwardRef<
    { session: IBrowserServiceSession<FRONTEND> },
    { children: ReactNode }
  >(function ServiceProvider(providerProps, ref) {
    const { children } = providerProps;
    const parentContext = useContext(ReactContext);
    const browserPartitionController = useContext(
      BrowserPartitionControllerContext,
    );

    if (browserPartitionController === null) {
      throw new Error(
        'ZerospinConfig with partitionKey must be mounted above <ServiceFrontend>.Provider.',
      );
    }
    if (parentContext !== null) {
      throw new Error(
        'The same service ReactSession.Provider is already mounted above this Provider.',
      );
    }

    const isUnmountedRef = useRef(false);
    const releaseBrowserSessionRef = useRef<Effect.Effect<void> | null>(null);

    const coreSession = useMemo(() => {
      const sessionId = sessionRuntime.runSync(
        makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        }),
      );
      return makeServiceSession({
        frontend,
        sessionId,
        mode: browserPartitionController.isSharedWorkerEnabled
          ? 'shared-worker'
          : 'direct',
      });
    }, [browserPartitionController]);

    const session = useMemo<IBrowserServiceSession<FRONTEND>>(
      () => ({
        browserPartitionController,
        coreSession,
        frontend: coreSession.frontend,
        sessionId: coreSession.sessionId,
        onInitialized: coreSession.onInitialized,
        store: coreSession.store,
      }),
      [browserPartitionController, coreSession],
    );

    useImperativeHandle(ref, () => ({ session }), [session]);

    const { error: bootstrapError } = useSWRImmutable<
      Readonly<{ releaseBrowserSession: Effect.Effect<void> }>,
      IAnyError,
      IBrowserServiceSession<FRONTEND>
    >(
      session,
      browserSession =>
        sessionRuntime
          .runPromise(
            bootstrapBrowserServiceSession({
              session: browserSession.coreSession,
              browserPartitionController,
            }).pipe(
              Effect.provide(
                makeTelemetryLayer(
                  coreSession.store.getState().telemetryCollector,
                ),
              ),
              Effect.provide(AsyncLive),
            ),
          )
          .then(data => {
            releaseBrowserSessionRef.current = data.releaseBrowserSession;
            if (isUnmountedRef.current) {
              releaseBrowserSessionRef.current = null;
              sessionRuntime.runFork(data.releaseBrowserSession);
            }
            return data;
          }),
      { shouldRetryOnError: false },
    );

    const isInitialized = useStore(
      coreSession.store,
      state => state.isInitialized,
    );

    useEffect(() => {
      // Sibling Providers intentionally own separate main-thread sessions.
      // Only nested Providers are rejected above because they shadow context.
      isUnmountedRef.current = false;

      return () => {
        isUnmountedRef.current = true;
        const releaseBrowserSession = releaseBrowserSessionRef.current;
        if (releaseBrowserSession !== null) {
          releaseBrowserSessionRef.current = null;
          sessionRuntime.runFork(releaseBrowserSession);
        }
      };
    }, []);

    useEffect(() => {
      zerospinDevtoolsStore.getState().addServiceSession({
        session: coreSession,
      });
      return () => {
        zerospinDevtoolsStore
          .getState()
          .removeServiceSession(coreSession.sessionId);
      };
    }, [coreSession]);

    if (bootstrapError !== undefined) {
      throw bootstrapError;
    }
    if (!isInitialized) {
      return null;
    }

    return (
      <ReactContext.Provider value={{ session }}>
        {children}
      </ReactContext.Provider>
    );
  });
}
