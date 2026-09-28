import { applyAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshot';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { AssertContractMutationsInModels } from '@zerospin/core/contracts/assertMutationsUseModels';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import { makeSessionQueryDb } from '@zerospin/core/drizzle/make/makeSessionQueryDb';
import type { IAnyModels, InferResource } from '@zerospin/core/models/types';
import { makeSessionDefinition } from '@zerospin/core/sessionDefinition/makeSessionDefinition';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import {
  catchZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  type ITypeError,
} from '@zerospin/schema';
import { Effect, Layer, Schema, type Scope } from 'effect';

import { makeSessionLifecycle } from '../makeSessionLifecycle';
import type {
  ISessionRuntimeServices,
  IZerospinRuntime,
} from '../sessionRuntime';

import { encodeFixtureResources } from './encodeFixtureResources';

const MOCK_SYSTEM_NAME = 'mock';
/**
 * Detached fixture session. Construction is synchronous and acquires no
 * resources. initialize/dispose own the in-memory SQLite lifecycle. No
 * credentials, backup, DevTools registration, or push delivery.
 */
export function makeMockAggregateSession<
  APP_LAYER extends Layer.Layer<never, IAnyError> = Layer.Layer<never>,
  const DEFINITION extends Omit<
    IAggregateSessionDefinition,
    'systemName' | 'modelNames'
  > = Omit<IAggregateSessionDefinition, 'systemName' | 'modelNames'>,
  MODELS extends IAnyModels = DEFINITION['models'],
>(
  props: {
    definition: DEFINITION & {
      models: MODELS;
      contracts: {
        [K in keyof DEFINITION['contracts'] &
          string]: K extends DEFINITION['contracts'][K]['commandName']
          ? AssertContractMutationsInModels<
              DEFINITION['contracts'][K],
              NoInfer<MODELS>
            >
          : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
      };
    };
    layer?: APP_LAYER;
    claims: DEFINITION['claimsSchema']['Type'];
    resources?: Partial<{
      [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
    }>;
  } & ([
    Exclude<
      NonNullable<
        IAggregateSessionDefinition<
          string,
          string,
          string,
          NoInfer<DEFINITION['contracts']>
        >['__initializeRequirements']
      >,
      ISessionRuntimeServices | Scope.Scope
    >,
  ] extends [never]
    ? unknown
    : {
        layer: Layer.Layer<
          Exclude<
            NonNullable<
              IAggregateSessionDefinition<
                string,
                string,
                string,
                NoInfer<DEFINITION['contracts']>
              >['__initializeRequirements']
            >,
            ISessionRuntimeServices | Scope.Scope
          >,
          IAnyError
        >;
      }),
): IAggregateSession<
  DEFINITION & {
    systemName: typeof MOCK_SYSTEM_NAME;
    modelNames: readonly string[];
  }
> & {
  readonly runtime: IZerospinRuntime<Layer.Success<APP_LAYER>>;
  readonly systemName: typeof MOCK_SYSTEM_NAME;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};

export function makeMockAggregateSession(props: {
  definition: Omit<IAggregateSessionDefinition, 'systemName' | 'modelNames'>;
  layer?: Layer.Layer<never, IAnyError>;
  claims: Readonly<Record<string, unknown>>;
  resources?: Partial<
    Record<string, readonly InferResource<IAnyModels[string]>[]>
  >;
}): unknown {
  const {
    definition: authoredDefinition,
    layer = Layer.empty,
    claims: fixtureClaims,
    resources: fixtureResources = {},
  } = props;
  const definition = makeSessionDefinition({
    ...authoredDefinition,
    systemName: MOCK_SYSTEM_NAME,
  });
  if (definition.kind !== 'aggregate') {
    throw new Error('Mock aggregate sessions require an aggregate');
  }
  const coreSession = makeAggregateSession<typeof definition>({ definition });

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
        queryDb: null,
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
        backupState: { status: 'released', failure: null },
      });
    },
  });
  const initialize = (): Promise<void> =>
    lifecycle.initialize(({ runtime, ready }) =>
      Effect.gen(function* () {
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        // No executeAggregateSessionCommand — staging stays local.
        coreSession.setExecutionResources({
          sessionId,
          runtime,
          settleLocally: true,
        });

        const claims = yield* Schema.encodeEffect(definition.claimsSchema)(
          fixtureClaims,
        ).pipe(
          mapParseError({
            code: 'mock-session-claims-invalid',
            prefix: 'Invalid mock claims',
          }),
        );
        const aggregateId = yield* Schema.decodeUnknownEffect(
          makeAbbreviationIdSchema('acct'),
        )(claims.aggregateId).pipe(
          mapParseError({
            code: 'mock-session-aggregate-id-invalid',
            prefix: 'Invalid mock aggregate ID',
          }),
        );
        const models = definition.models;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoDbConfig.tables,
        });
        // acquireRelease keeps open uninterruptible so dispose mid-open
        // still registers close and runs it exactly once.
        const db = yield* Effect.acquireRelease(
          makeProvisionedInMemoryWasmSqliteDb({
            dbConfig,
          }),
          acquiredDb =>
            makeAsync(
              () => acquiredDb.$client.sqlite3.close(acquiredDb.$client.db),
              catchZerospinError({
                code: 'failed-to-close-mock-session-database',
                message: 'Failed to close mock session database',
              }),
            ).pipe(Effect.asVoid, Effect.ignore),
        );

        const queryDb = makeSessionQueryDb({ models, client: db.$client });
        const aggregateSessionLockKey = yield* makeAggregateSessionLockKey(
          makeAggregateSessionLock(definition),
        );
        const resources = yield* encodeFixtureResources({
          models,
          resources: fixtureResources,
        });

        yield* applyAggregateSessionSnapshot({
          db,
          definition,
          sessionId,
          aggregateId,
          claims,
          snapshot: {
            actorName: definition.actorName,
            actorVersion: definition.actorVersion,

            aggregateId,
            aggregateName: definition.aggregateName,
            claims: fixtureClaims,
            aggregateIndex: 0,
            executedIndex: 0,
            executedHash:
              '76e4e2d226c914c939d1f2b94550195f0dad064d8ca8d448a7101b458ced9ce0',
            sessionName: definition.sessionName,
            aggregateVersion: definition.aggregateVersion,
            resolvedThrough: 0,
            resources,
          },
          models,
        });

        coreSession.store.setState({
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,

          aggregateId,
          aggregateName: definition.aggregateName,
          claims: Schema.decodeUnknownSync(definition.claimsSchema)(claims),
          db,
          queryDb,
          aggregateIndex: 0,
          executedIndex: 0,
          executedHash:
            '76e4e2d226c914c939d1f2b94550195f0dad064d8ca8d448a7101b458ced9ce0',
          pushIndex: 0,
          sessionName: definition.sessionName,
          aggregateSessionLockKey,
          isInitialized: true,
          models,
          schema: dbConfig.schema,
          sessionId,
          sessionStatus: 'current',
          backupState: {
            status: 'ready',
            failure: null,
          },
        });

        ready();
        return yield* Effect.never;
      }),
    );
  const dispose = lifecycle.dispose;

  // Same object identity as the core session so stageCommand WeakMap lookups
  // and DevTools registration share one session reference.
  return Object.defineProperty(
    Object.assign(coreSession, {
      systemName: MOCK_SYSTEM_NAME,
      runtime: lifecycle.runtime,
      initialize,
      dispose,
    }),
    'runtime',
    { enumerable: true, get: () => lifecycle.runtime },
  );
}
