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
import { SignatureFactory } from '@zerospin/core/services/SignatureFactory';
import type { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { type IAnyError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { Effect, type ManagedRuntime } from 'effect';
import useSWRImmutable from 'swr/immutable';
import { useStore } from 'zustand/react';

import { bootstrapBrowserSession } from './bootstrapBrowserSession';
import { makeBrowserSession } from './makeBrowserSession';
import { BrowserUserControllerContext } from './makeBrowserUserController';
import type { IBrowserSession, IReactSessionContext } from './types';
import { usePushQueue } from './usePushQueue';

type IBootstrapSessionData = {
  actor: IActor;
  releaseBrowserSession: Effect.Effect<void>;
};

const activeReactSessionProviders = new WeakMap<object, object>();

/*
 * 1. Capture ReactSession inputs and browser release state.
 * 2. Build a stable provider instance and reject nested providers.
 * 3. Create the browser session once for this mounted Provider.
 * 4. Bootstrap the session through the runtime and Effect services.
 * 5. Register the active Provider instance and clean it up.
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
      generateSignature: ISignatureFactory;
    }
  >(function Provider(props, ref) {
    const { children, generateSignature } = props;
    const parentContext = useContext(ReactContext);
    const browserUserController = useContext(BrowserUserControllerContext);

    if (browserUserController === null) {
      throw new Error(
        'ZerospinConfig with userId must be mounted above <Frontend>.Provider.',
      );
    }

    // 2 — nested same-ReactSession Provider would shadow the existing session context
    if (parentContext !== null) {
      throw new Error(
        'The same ReactSession.Provider is already mounted above this Provider.',
      );
    }

    // Mount-time factory for one-shot bootstrap (`useSWRImmutable` runs once per session).
    const generateSignatureRef = useRef(generateSignature);
    const isSharedWorkerEnabledRef = useRef(
      browserUserController.isSharedWorkerEnabled,
    );
    const providerInstanceRef = useRef<object | null>(null);
    const isUnmountedRef = useRef(false);
    const releaseBrowserSessionRef = useRef<Effect.Effect<void> | null>(null);
    if (providerInstanceRef.current === null) {
      providerInstanceRef.current = {};
    }

    // 3 — one browser session id/store per Provider mount
    const coreSession = useMemo(() => {
      const sessionId = sessionRuntime.runSync(
        makeIdFromAbbreviation({
          abbreviation: cloudIdAbbreviations.defaultSession,
        }),
      );
      return makeSession({
        frontend,
        sessionId,
        isPushPaused,
        isSharedWorkerEnabled: isSharedWorkerEnabledRef.current,
        runtime: sessionRuntime,
      });
    }, []);

    const session = useMemo(
      () =>
        makeBrowserSession({
          browserUserController,
          session: coreSession,
        }),
      [browserUserController, coreSession],
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
              browserUserController,
              generateSignature: generateSignatureRef.current,
            }).pipe(
              Effect.provide(
                makeTelemetryLayer(
                  coreSession.store.getState().telemetryCollector,
                ),
              ),
              Effect.provide(AsyncLive),
              Effect.provideService(
                SignatureFactory,
                generateSignatureRef.current,
              ),
            ),
          )
          .then(data => {
            releaseBrowserSessionRef.current = data.releaseBrowserSession;
            if (isUnmountedRef.current) {
              releaseBrowserSessionRef.current = null;
              sessionRuntime.runSync(data.releaseBrowserSession);
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

    usePushQueue({
      session,
      generateSignature,
      sessionRuntime,
      enabled: isInitialized,
    });

    useEffect(() => {
      // 5 — sibling same-ReactSession Provider would create a second browser session owner
      isUnmountedRef.current = false;
      const providerInstance = providerInstanceRef.current;
      if (providerInstance === null) {
        return;
      }
      const activeProvider = activeReactSessionProviders.get(ReactContext);
      if (activeProvider !== undefined && activeProvider !== providerInstance) {
        throw new Error(
          'The same ReactSession.Provider is already mounted on this page.',
        );
      }
      activeReactSessionProviders.set(ReactContext, providerInstance);

      return () => {
        if (
          activeReactSessionProviders.get(ReactContext) === providerInstance
        ) {
          activeReactSessionProviders.delete(ReactContext);
        }
        isUnmountedRef.current = true;
        const releaseBrowserSession = releaseBrowserSessionRef.current;
        if (releaseBrowserSession !== null) {
          releaseBrowserSessionRef.current = null;
          sessionRuntime.runSync(releaseBrowserSession);
        }
      };
    }, []);

    useEffect(() => {
      // 6 — devtools store tracks the concrete initialized session by sessionId
      // Register with devtools when mounted; session is stable for this provider instance.
      zerospinDevtoolsStore.getState().addSession(session);

      return () => {
        zerospinDevtoolsStore.getState().removeSession(session.sessionId);
      };
    }, [session]);

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

    // 8 — initialized provider makes the session and current signature factory available
    return (
      <ReactContext.Provider
        value={{
          session,
          generateSignature,
        }}
      >
        {children}
      </ReactContext.Provider>
    );
  });
}
