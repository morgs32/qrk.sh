import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import type { AssertContractMutationsInModels } from '@zerospin/core/contracts/assertMutationsUseModels';
import type { IAnyContracts } from '@zerospin/core/contracts/types';
import type {
  IClaimsSchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import type {
  IAnyModels,
  IAssertValidModels,
  IModelReplica,
} from '@zerospin/core/models/types';
import { composeDeclarations } from '@zerospin/core/module/composeDeclarations';
import type {
  IAnyDeclarationModule,
  IAssertDistinctDeclarations,
  IComposedDeclarations,
} from '@zerospin/core/module/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { makeSessionDefinition } from '@zerospin/core/sessionDefinition/makeSessionDefinition';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { makeIdFromAbbreviation, type ITypeError } from '@zerospin/schema';
import { Effect, Layer, Redacted, type Schema, type Scope } from 'effect';

import { bootstrapAggregateSession } from '../bootstrapAggregateSession.ts';
import { bootstrapServiceSession } from '../bootstrapServiceSession.ts';
import { makeSessionLifecycle } from '../makeSessionLifecycle';
import type {
  ISessionRuntimeServices,
  IZerospinRuntime,
} from '../sessionRuntime';

import { makeAdmissionProvider } from './makeAdmissionProvider';

type AggregateSessionRequirements<CONTRACTS extends IAnyContracts> = {
  [K in keyof CONTRACTS]:
    | Effect.Services<ReturnType<CONTRACTS[K]['program']>>
    | Effect.Services<ReturnType<NonNullable<CONTRACTS[K]['guard']>>>;
}[keyof CONTRACTS];

type IAssertSessionContracts<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
> = {
  [K in keyof CONTRACTS & string]: K extends CONTRACTS[K]['commandName']
    ? AssertContractMutationsInModels<CONTRACTS[K], MODELS>
    : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
};

type IAssertServiceModels<
  MODELS extends IAnyModels,
  ALL_MODELS extends IAnyModels,
> = IAssertValidModels<MODELS, ALL_MODELS> & {
  [K in keyof MODELS]: MODELS[K] extends IModelReplica
    ? ITypeError<'Service session models must be authoritative, not replicas'>
    : MODELS[K];
};

/**
 * Imperative browser session composition. Construction is synchronous and
 * acquires no resources. initialize/dispose own the resource lifecycle.
 */
export function makeSession<
  const AGGREGATE_NAME extends string,
  const AGGREGATE_VERSION extends string,
  const ACTOR_NAME extends string,
  const ACTOR_VERSION extends string,
  const SESSION_NAME extends string,
  const CLAIMS extends IClaimsSchema,
  APP_LAYER extends Layer.Layer<never, IAnyError>,
  const SYSTEM_NAME extends string,
  const MODELS extends IAnyModels = {},
  const CONTRACTS extends IAnyContracts = {},
  const MODULES extends Readonly<Record<string, IAnyDeclarationModule>> = {},
  const CREDENTIALS extends Schema.Codec<unknown, unknown> | undefined =
    undefined,
>(props: {
  sharedWorker: (props: { name: string }) => SharedWorker;
  kind: 'aggregate';
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  actorName: ACTOR_NAME;
  actorVersion: ACTOR_VERSION;
  sessionName: SESSION_NAME;
  claimsSchema: CLAIMS;
  readonly credentialsSchema?: CREDENTIALS;
  models?: MODELS &
    IAssertValidModels<
      NoInfer<MODELS>,
      NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
    >;
  contracts?: CONTRACTS &
    IAssertSessionContracts<
      NoInfer<CONTRACTS>,
      NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
    >;
  modules?: MODULES &
    IAssertDistinctDeclarations<
      NoInfer<MODELS>,
      NoInfer<CONTRACTS>,
      NoInfer<MODULES>
    > & {
      [K in keyof MODULES]: {
        models: IAssertValidModels<
          NoInfer<MODULES[K]['models']>,
          NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
        >;
        contracts: IAssertSessionContracts<
          NoInfer<MODULES[K]['contracts']>,
          NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
        >;
      };
    };
  layer: APP_LAYER &
    Layer.Layer<
      | ZerospinApiUrl
      | PublishableKey
      | Exclude<
          AggregateSessionRequirements<
            IComposedDeclarations<CONTRACTS, MODULES, 'contracts'>
          >,
          ISessionRuntimeServices | Scope.Scope
        >,
      IAnyError
    >;
  systemName: SYSTEM_NAME;
}): IAggregateSession<
  IAggregateSessionDefinition<
    SYSTEM_NAME,
    AGGREGATE_NAME,
    SESSION_NAME,
    IComposedDeclarations<CONTRACTS, MODULES, 'contracts'>,
    IComposedDeclarations<MODELS, MODULES, 'models'>,
    AGGREGATE_VERSION,
    CLAIMS
  > & { readonly actorName: ACTOR_NAME; readonly actorVersion: ACTOR_VERSION }
> & {
  readonly runtime: IZerospinRuntime<Layer.Success<APP_LAYER>>;
  readonly systemName: SYSTEM_NAME;
  readonly claimsSchema: CLAIMS;
  readonly credentialsSchema?: CREDENTIALS;
  initialize(props: ISessionInitialization<CLAIMS, CREDENTIALS>): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication(): Promise<void>;
};

export function makeSession<
  const SERVICE_NAME extends string,
  const SERVICE_VERSION extends string,
  const ACTOR_NAME extends string,
  const ACTOR_VERSION extends string,
  const SESSION_NAME extends string,
  const CLAIMS extends IClaimsSchema,
  APP_LAYER extends Layer.Layer<never, IAnyError>,
  const SYSTEM_NAME extends string,
  const MODELS extends IAnyModels = {},
  const MODULES extends Readonly<Record<string, IAnyDeclarationModule>> = {},
  const CREDENTIALS extends Schema.Codec<unknown, unknown> | undefined =
    undefined,
>(
  props: {
    sharedWorker: (props: { name: string }) => SharedWorker;
    kind: 'service';
    serviceName: SERVICE_NAME;
    serviceVersion: SERVICE_VERSION;
    actorName: ACTOR_NAME;
    actorVersion: ACTOR_VERSION;
    sessionName: SESSION_NAME;
    claimsSchema: CLAIMS;
    readonly credentialsSchema?: CREDENTIALS;
    models?: MODELS &
      IAssertServiceModels<
        NoInfer<MODELS>,
        NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
      >;
    contracts?: Readonly<Record<string, never>>;
    modules?: MODULES &
      IAssertDistinctDeclarations<NoInfer<MODELS>, {}, NoInfer<MODULES>> & {
        [K in keyof MODULES]: {
          models: IAssertServiceModels<
            NoInfer<MODULES[K]['models']>,
            NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
          >;
          contracts: Readonly<Record<string, never>>;
        };
      };
    layer: APP_LAYER;
    systemName: SYSTEM_NAME;
  } & ([
    Exclude<ZerospinApiUrl | PublishableKey, NoInfer<Layer.Success<APP_LAYER>>>,
  ] extends [never]
    ? unknown
    : ITypeError<'Session layer is missing API configuration'>),
): IServiceSession<
  IServiceSessionDefinition<
    SYSTEM_NAME,
    SERVICE_NAME,
    SESSION_NAME,
    IComposedDeclarations<MODELS, MODULES, 'models'>,
    SERVICE_VERSION,
    CLAIMS
  > & { readonly actorName: ACTOR_NAME; readonly actorVersion: ACTOR_VERSION }
> & {
  readonly runtime: IZerospinRuntime<Layer.Success<APP_LAYER>>;
  readonly systemName: SYSTEM_NAME;
  readonly claimsSchema: CLAIMS;
  readonly credentialsSchema?: CREDENTIALS;
  initialize(props: ISessionInitialization<CLAIMS, CREDENTIALS>): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication(): Promise<void>;
};

export function makeSession(props: unknown): unknown {
  const input = props as Omit<
    Parameters<typeof makeSessionDefinition>[0],
    'models' | 'contracts'
  > &
    Partial<IAnyDeclarationModule> & {
      sharedWorker: (props: { name: string }) => SharedWorker;
      modules?: Readonly<Record<string, IAnyDeclarationModule>>;
      layer: Layer.Layer<unknown, IAnyError>;
      credentialsSchema?: Schema.Codec<unknown, unknown>;
    };
  const { claimsSchema, credentialsSchema, systemName, layer, sharedWorker } =
    input;
  if ('module' in input) {
    throw new Error('Unknown session property module');
  }
  const { models, contracts } = composeDeclarations(input);
  if (input.kind === 'service' && Object.keys(contracts).length !== 0) {
    throw new Error('Service sessions cannot contain contracts');
  }
  const definition = makeSessionDefinition({
    ...input,
    models,
    contracts,
  });

  if (definition.kind === 'aggregate') {
    const coreSession = makeAggregateSession({
      definition,
    });

    const lifecycle = makeSessionLifecycle({
      layer,
      infrastructure: Layer.empty,
      onDispose: () => {
        coreSession.clearExecutionResources();
        coreSession.store.setState({
          actorName: null,
          actorVersion: null,

          sessionStatus: 'released',
          isInitialized: false,
          db: null,
          schema: null,
          models: null,
          sessionId: null,
          aggregateId: null,
          aggregateName: null,
          claims: null,
          sessionName: null,
          aggregateSessionLockKey: null,
          aggregateIndex: null,
          executedIndex: null,
          executedHash: null,
          pushIndex: null,
          backupState: null,
          nodeState: null,
        });
      },
    });
    let clearAuthentication = async () => {};
    const initialize = (
      initializeProps: ISessionInitialization<
        IClaimsSchema,
        Schema.Codec<unknown, unknown> | undefined
      >,
    ): Promise<void> => {
      const admission = makeAdmissionProvider({
        claimsSchema,
        credentialsSchema,
        initialization: initializeProps,
      });
      return lifecycle.initialize(({ runtime, ready }) =>
        Effect.gen(function* () {
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          let executeAggregateSessionCommand: NonNullable<
            Parameters<
              typeof coreSession.setExecutionResources
            >[0]['executeAggregateSessionCommand']
          > | null = null;
          coreSession.setExecutionResources({
            sessionId,
            runtime,
            executeAggregateSessionCommand: executeProps =>
              executeAggregateSessionCommand === null
                ? Effect.fail(
                    makeZerospinError({
                      code: 'aggregate-session-not-ready',
                      message:
                        'Command staging started before the aggregate replica was acquired',
                    }),
                  )
                : executeAggregateSessionCommand(executeProps),
          });

          const apiUrl = yield* ZerospinApiUrl;
          const publishableKey = Redacted.value(yield* PublishableKey);
          const bootstrap = yield* bootstrapAggregateSession({
            aggregateVersion: definition.aggregateVersion,
            session: coreSession,
            apiUrl,
            publishableKey,
            systemName,
            getAdmission: () =>
              runtime.runPromise(
                Effect.suspend(admission.getAdmission).pipe(encodeRpcOutcome),
              ),
            expectedClaims: admission.claims,
            sharedWorker,
          }).pipe(
            Effect.provide(
              makeTelemetryLayer(
                coreSession.store.getState().telemetryCollector,
              ),
            ),
          );
          executeAggregateSessionCommand =
            bootstrap.executeAggregateSessionCommand;
          clearAuthentication = bootstrap.clearAuthentication;

          const devtoolsEntry = {
            session: coreSession,
            history: bootstrap.history,
            getPushPaused: () =>
              runtime.runPromise(
                bootstrap.getPushPaused.pipe(encodeRpcOutcome),
              ),
            setPushPaused: (pushPausedProps: { pushPaused: boolean }) =>
              runtime.runPromise(
                bootstrap.setPushPaused(pushPausedProps).pipe(encodeRpcOutcome),
              ),
            pushNow: () =>
              runtime.runPromise(bootstrap.pushNow.pipe(encodeRpcOutcome)),
          };
          let registeredSessionId = coreSession.sessionId;
          if (registeredSessionId !== null) {
            zerospinDevtoolsStore.getState().addAggregateSession(devtoolsEntry);
          }
          const unsubscribe = coreSession.store.subscribe(state => {
            if (
              state.sessionId === registeredSessionId ||
              state.sessionId === null
            ) {
              return;
            }
            if (registeredSessionId !== null) {
              zerospinDevtoolsStore
                .getState()
                .removeAggregateSession(registeredSessionId);
            }
            registeredSessionId = state.sessionId;
            zerospinDevtoolsStore.getState().addAggregateSession(devtoolsEntry);
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              unsubscribe();
              if (registeredSessionId !== null) {
                zerospinDevtoolsStore
                  .getState()
                  .removeAggregateSession(registeredSessionId);
              }
            }),
          );

          ready();
          return yield* Effect.never;
        }),
      );
    };
    const dispose = lifecycle.dispose;

    // Same object identity as the core session so stageCommand WeakMap lookups
    // and DevTools registration share one session reference.
    return Object.defineProperty(
      Object.assign(coreSession, {
        systemName,
        claimsSchema,
        credentialsSchema,
        initialize,
        dispose,
        clearAuthentication: () => clearAuthentication(),
      }),
      'runtime',
      { enumerable: true, get: () => lifecycle.runtime },
    );
  }

  const coreSession = makeServiceSession({
    definition,
    models: definition.models,
  });

  const lifecycle = makeSessionLifecycle({
    layer,
    infrastructure: Layer.empty,
    onDispose: () => {
      coreSession.store.setState({
        sessionStatus: 'released',
        isInitialized: false,
        db: null,
        schema: null,
        models: null,
        sessionId: null,
        claims: null,
        serviceName: null,
        sessionName: null,
        serviceSessionLockKey: null,
        serviceIndex: null,
        serviceHash: null,
        serviceVersion: null,
        backupState: null,
        nodeState: null,
      });
    },
  });
  let clearAuthentication = async () => {};
  const initialize = (
    initializeProps: ISessionInitialization<
      IClaimsSchema,
      Schema.Codec<unknown, unknown> | undefined
    >,
  ): Promise<void> => {
    const admission = makeAdmissionProvider({
      claimsSchema,
      credentialsSchema,
      initialization: initializeProps,
    });
    return lifecycle.initialize(({ runtime, ready }) =>
      Effect.gen(function* () {
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        coreSession.setSessionId(sessionId);
        const apiUrl = yield* ZerospinApiUrl;
        const publishableKey = Redacted.value(yield* PublishableKey);
        const bootstrap = yield* bootstrapServiceSession({
          serviceVersion: definition.serviceVersion,
          session: coreSession,
          apiUrl,
          publishableKey,
          systemName,
          getAdmission: () =>
            runtime.runPromise(
              Effect.suspend(admission.getAdmission).pipe(encodeRpcOutcome),
            ),
          expectedClaims: admission.claims,
          sharedWorker,
        }).pipe(
          Effect.provide(
            makeTelemetryLayer(coreSession.store.getState().telemetryCollector),
          ),
        );

        clearAuthentication = bootstrap.clearAuthentication;
        zerospinDevtoolsStore.getState().addServiceSession({
          session: coreSession,
        });
        let registeredSessionId = coreSession.sessionId;
        const unsubscribe = coreSession.store.subscribe(state => {
          if (
            state.sessionId === registeredSessionId ||
            state.sessionId === null
          ) {
            return;
          }
          if (registeredSessionId !== null) {
            zerospinDevtoolsStore
              .getState()
              .removeServiceSession(registeredSessionId);
          }
          registeredSessionId = state.sessionId;
          zerospinDevtoolsStore.getState().addServiceSession({
            session: coreSession,
          });
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unsubscribe();
            if (registeredSessionId !== null) {
              zerospinDevtoolsStore
                .getState()
                .removeServiceSession(registeredSessionId);
            }
          }),
        );

        ready();
        return yield* Effect.never;
      }),
    );
  };
  const dispose = lifecycle.dispose;

  return Object.defineProperty(
    Object.assign(coreSession, {
      systemName,
      claimsSchema,
      credentialsSchema,
      initialize,
      dispose,
      clearAuthentication: () => clearAuthentication(),
    }),
    'runtime',
    { enumerable: true, get: () => lifecycle.runtime },
  );
}
