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

import type { IActor } from '@zerospin/core/actorController/types';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { type IAnyError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Queue, type ManagedRuntime } from 'effect';
import useSWRImmutable from 'swr/immutable';
import { useStore } from 'zustand/react';

import { bootstrapBrowserSession } from './bootstrapBrowserSession';
import { BrowserPartitionControllerContext } from './makeBrowserPartitionController';
import { makeBrowserSession } from './makeBrowserSession';
import type { IBrowserSession, IReactSessionContext } from './types';
import { usePushQueue } from './usePushQueue';

type IBootstrapSessionData = {
  actor: IActor;
  releaseBrowserSession: Effect.Effect<void>;
};

/*
 * 1. Capture ReactSession inputs and browser release state.
 * 2. Build a stable provider instance and reject nested providers.
 * 3. Create the browser session once for this mounted Provider.
 * 4. Bootstrap the session through the runtime and Effect services.
 * 5. Release only this mounted Provider's session and push queue.
 * 6. Register the initialized session with devtools.
 * 7. Report bootstrap failures with targeted errors.
 * 8. Render children only after initialization.
 */
export function makeProvider<FRONTEND extends IFrontendController>(props: {
  ReactContext: Context<IReactSessionContext<FRONTEND> | null>;
  sessionRuntime: ManagedRuntime.ManagedRuntime<
    Async | CuidFactory | MonotonicFactory | PublishableKey | ZerospinApisUrl,
    IAnyError
  >;
  frontend: FRONTEND;
  isPushPaused?: boolean;
}) {
  const {
    ReactContext,
    sessionRuntime,
    frontend,
    isPushPaused = false,
  } = props;

  return forwardRef<
    {
      session: IBrowserSession<FRONTEND>;
    },
    {
      children: ReactNode;
    }
  >(function Provider(props, ref) {
    const { children } = props;
    const parentContext = useContext(ReactContext);
    const browserPartitionController = useContext(
      BrowserPartitionControllerContext,
    );

    if (browserPartitionController === null) {
      throw new Error(
        'ZerospinConfig with partitionKey must be mounted above <Frontend>.Provider.',
      );
    }

    // 2 — nested same-ReactSession Provider would shadow the existing session context
    if (parentContext !== null) {
      throw new Error(
        'The same ReactSession.Provider is already mounted above this Provider.',
      );
    }

    // Mount-time factory for one-shot bootstrap (`useSWRImmutable` runs once per session).
    const isSharedWorkerEnabledRef = useRef(
      browserPartitionController.isSharedWorkerEnabled,
    );
    const isUnmountedRef = useRef(false);
    const releaseBrowserSessionRef = useRef<Effect.Effect<void> | null>(null);

    // A capacity-one dropping queue retains one pending wake while paused or
    // offline without parking one producer fiber for every staged command.
    const pushQueue = useMemo(
      () => sessionRuntime.runSync(Queue.dropping<number>(1)),
      [],
    );

    // 3 — one browser session id/store per Provider mount
    const coreSession = useMemo(() => {
      const sessionId = sessionRuntime.runSync(
        makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        }),
      );
      if (isSharedWorkerEnabledRef.current) {
        return makeSession({
          frontend,
          generateSignature: () =>
            browserPartitionController.getAccountGenerateSignature(frontend)(),
          sessionId,
          stageFrontendCommand: stageProps =>
            browserPartitionController.stageAccountFrontendCommand({
              sessionId,
              ...stageProps,
            }),
          isPushPaused,
          isSharedWorkerEnabled: true,
          runtime: sessionRuntime,
        });
      }
      return makeSession({
        frontend,
        generateSignature: () =>
          browserPartitionController.getAccountGenerateSignature(frontend)(),
        sessionId,
        isPushPaused,
        isSharedWorkerEnabled: false,
        runtime: sessionRuntime,
      });
    }, [browserPartitionController]);

    const session = useMemo(
      () =>
        makeBrowserSession({
          browserPartitionController,
          onCommandStaged: () => {
            if (!isSharedWorkerEnabledRef.current && !isUnmountedRef.current) {
              sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
            }
          },
          session: coreSession,
        }),
      [browserPartitionController, coreSession, pushQueue],
    );

    useImperativeHandle(ref, () => ({ session }), [session]);

    const { error: bootstrapError } = useSWRImmutable<
      IBootstrapSessionData,
      IAnyError,
      IBrowserSession<FRONTEND>
    >(
      session,
      browserSession => {
        return sessionRuntime
          .runPromise(
            bootstrapBrowserSession({
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
          });
      },
      {
        shouldRetryOnError: false,
      },
    );

    const isInitialized = useStore(
      coreSession.store,
      state => state.isInitialized,
    );

    const { pushStagedCommands } = usePushQueue({
      pushQueue,
      session,
      sessionRuntime,
      enabled: isInitialized && !isSharedWorkerEnabledRef.current,
    });

    useEffect(() => {
      // 5 — sibling Providers intentionally own separate main-thread sessions.
      // Only nested Providers are rejected above because they shadow context.
      isUnmountedRef.current = false;

      return () => {
        isUnmountedRef.current = true;
        const releaseBrowserSession = releaseBrowserSessionRef.current;
        if (releaseBrowserSession !== null) {
          releaseBrowserSessionRef.current = null;
          sessionRuntime.runFork(releaseBrowserSession);
        }
        // React StrictMode immediately replays this effect's setup after its
        // simulated cleanup. Defer the terminal shutdown so that replay can
        // mark the still-mounted provider active before this check runs.
        queueMicrotask(() => {
          if (isUnmountedRef.current) {
            sessionRuntime.runSync(Queue.shutdown(pushQueue));
          }
        });
      };
    }, [pushQueue]);

    useEffect(() => {
      // 6 — devtools store tracks the concrete initialized session by sessionId
      // Register with devtools when mounted; session is stable for this provider instance.
      zerospinDevtoolsStore.getState().addAccountSession({
        pushStagedCommands,
        session: coreSession,
      });

      return () => {
        zerospinDevtoolsStore
          .getState()
          .removeAccountSession(session.sessionId);
      };
    }, [coreSession, pushStagedCommands, session]);

    if (bootstrapError) {
      // 7 — map only missing-deploy / apis-down cases; keep domain errors intact
      const bootstrapText = `${bootstrapError.message}\n${bootstrapError.cause ?? ''}`;
      if (
        bootstrapError.code === 'failed-to-get-namespace-system-worker' ||
        ((bootstrapError.code === 'failed-to-authenticate-frontend-rpc' ||
          bootstrapError.code === 'failed-to-authorize-frontend-rpc') &&
          (bootstrapText.includes(
            'The RPC receiver does not implement the method',
          ) ||
            bootstrapText.includes('Durable Object Namespace was deleted')))
      ) {
        throw new Error(
          "The deployed system can't be found. Are you sure you did a deploy?",
        );
      }
      if (
        bootstrapError.code === 'async-failed' &&
        (bootstrapError.cause?.includes('ECONNREFUSED') === true ||
          bootstrapError.cause?.includes('fetch failed') === true)
      ) {
        throw new Error(
          'Zerospin API is not ready yet. Wait for apis dev to start, then refresh.',
        );
      }
      throw bootstrapError;
    }

    if (!isInitialized) {
      // 8 — children only see a session after bootstrap publishes initialized state
      return null;
    }

    // 8 — initialized provider makes the browser session available
    return (
      <ReactContext.Provider value={{ session }}>
        {children}
      </ReactContext.Provider>
    );
  });
}
