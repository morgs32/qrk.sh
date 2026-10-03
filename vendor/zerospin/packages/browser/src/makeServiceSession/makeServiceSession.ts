import type { IAnyContracts } from '@zerospin/core/contracts/types';
import type {
  IClaimsSchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import type {
  IAnyModels,
  IAssertValidModels,
} from '@zerospin/core/models/types';
import { composeDeclarations } from '@zerospin/core/module/composeDeclarations';
import type {
  IAnyDeclarationModule,
  IAssertDistinctDeclarations,
  IComposedDeclarations,
} from '@zerospin/core/module/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession as makeCoreServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import type { IAnyError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { makeIdFromAbbreviation, type ITypeError } from '@zerospin/schema';
import { Effect, Layer, Redacted, type Schema } from 'effect';

import { bootstrapServiceSession } from '../bootstrapServiceSession.ts';
import { makeAdmissionProvider } from '../makeSession/makeAdmissionProvider';
import { makeSessionLifecycle } from '../makeSessionLifecycle';
import type { IZerospinRuntime } from '../sessionRuntime';
type IAssertServiceModels<
  MODELS extends IAnyModels,
  ALL_MODELS extends IAnyModels,
> = IAssertValidModels<MODELS, ALL_MODELS> & {
  [K in keyof MODELS]: MODELS[K];
};
/** Browser service session construction; initialize/dispose own its resource lifecycle. */
export function makeServiceSession<
  const SERVICE_NAME extends string,
  const SERVICE_VERSION extends string,
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
>(
  props: {
    sharedWorker: (props: { name: string }) => SharedWorker;
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
    contracts?: CONTRACTS;
    modules?: MODULES &
      IAssertDistinctDeclarations<
        NoInfer<MODELS>,
        NoInfer<CONTRACTS>,
        NoInfer<MODULES>
      > & {
        [K in keyof MODULES]: {
          models: IAssertServiceModels<
            NoInfer<MODULES[K]['models']>,
            NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
          >;
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
  > & {
    readonly actorName: ACTOR_NAME;
    readonly actorVersion: ACTOR_VERSION;
    readonly contracts: IComposedDeclarations<CONTRACTS, MODULES, 'contracts'>;
  }
> & {
  readonly runtime: IZerospinRuntime<Layer.Success<APP_LAYER>>;
  readonly systemName: SYSTEM_NAME;
  readonly claimsSchema: CLAIMS;
  readonly credentialsSchema?: CREDENTIALS;
  initialize(props: ISessionInitialization<CLAIMS, CREDENTIALS>): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication(): Promise<void>;
};
export function makeServiceSession(props: unknown): unknown {
  const input = props as Omit<
    Parameters<typeof makeServiceSessionDefinition>[0],
    'models'
  > &
    Partial<IAnyDeclarationModule> & {
      systemName: string;
      sharedWorker: (props: { name: string }) => SharedWorker;
      modules?: Readonly<Record<string, IAnyDeclarationModule>>;
      layer: Layer.Layer<unknown, IAnyError>;
      credentialsSchema?: Schema.Codec<unknown, unknown>;
    };
  const { claimsSchema, credentialsSchema, systemName, layer, sharedWorker } =
    input;
  if ('module' in input) throw new Error('Unknown session property module');
  if ('kind' in input) {
    throw new Error('makeServiceSession does not accept kind');
  }
  const { models, contracts } = composeDeclarations(input);
  const definition = {
    ...makeServiceSessionDefinition({
      actorName: input.actorName,
      actorVersion: input.actorVersion,
      claimsSchema,
      serviceName: input.serviceName,
      serviceVersion: input.serviceVersion,
      sessionName: input.sessionName,
      models,
      contracts,
    }),
    systemName,
  };
  const coreSession = makeCoreServiceSession({
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
        executedIndex: null,
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
