import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import type { IAnyModels, InferResource } from '@zerospin/core/models/types';
import { applyServiceSessionSnapshot } from '@zerospin/core/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshot';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import {
  catchZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';

import { makeSessionLifecycle } from '../makeSessionLifecycle';
import type { IZerospinRuntime } from '../sessionRuntime';

import { encodeFixtureResources } from './encodeFixtureResources';

const MOCK_SYSTEM_NAME = 'mock';
/**
 * Detached fixture session. Construction is synchronous and acquires no
 * resources. initialize/dispose own the in-memory SQLite lifecycle. No
 * credentials, backup, DevTools registration, or push delivery.
 */
export function makeMockServiceSession<
  DEFINITION extends Omit<IServiceSessionDefinition, 'systemName'>,
  APP_LAYER extends Layer.Layer<never, IAnyError> = Layer.Layer<never>,
  MODELS extends IAnyModels = DEFINITION['models'],
>(props: {
  definition: DEFINITION & { models: MODELS };
  layer?: APP_LAYER;
  identity: DEFINITION['identity']['identitySchema']['Type'];
  resources?: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
}): IServiceSession<DEFINITION & { systemName: typeof MOCK_SYSTEM_NAME }> & {
  readonly runtime: IZerospinRuntime<Layer.Success<APP_LAYER>>;
  readonly systemName: typeof MOCK_SYSTEM_NAME;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};

export function makeMockServiceSession(props: {
  definition: Omit<IServiceSessionDefinition, 'systemName'>;
  layer?: Layer.Layer<never, IAnyError>;
  identity: Readonly<Record<string, unknown>>;
  resources?: Partial<
    Record<string, readonly InferResource<IAnyModels[string]>[]>
  >;
}): unknown {
  const {
    definition: authoredDefinition,
    layer = Layer.empty,
    identity: fixtureIdentity,
    resources: fixtureResources = {},
  } = props;
  const definition: typeof authoredDefinition & {
    systemName: typeof MOCK_SYSTEM_NAME;
  } = { ...authoredDefinition, systemName: MOCK_SYSTEM_NAME };

  const coreSession = makeServiceSession<typeof definition>({
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
        identity: null,
        serviceName: null,
        sessionName: null,
        serviceSessionLockKey: null,
        serviceIndex: null,
        serviceHash: null,
        serviceVersion: null,
        backupState: { status: 'released', failure: null },
      });
    },
  });
  const initialize = (): Promise<void> =>
    lifecycle.initialize(({ ready }) =>
      Effect.gen(function* () {
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        coreSession.setSessionId(sessionId);

        const identity = yield* Schema.encodeEffect(
          definition.identity.identitySchema,
        )(fixtureIdentity).pipe(
          mapParseError({
            code: 'mock-session-identity-invalid',
            prefix: 'Invalid mock identity',
          }),
        );
        const models = definition.models;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: serviceSessionRepoTables,
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

        const serviceSessionLockKey = yield* makeServiceSessionLockKey(
          makeServiceSessionLock(definition),
        );
        const resources = yield* encodeFixtureResources({
          models,
          resources: fixtureResources,
        });

        yield* applyServiceSessionSnapshot({
          definition,
          sessionId,
          identity,
          db,
          models,
          snapshot: {
            actorName: definition.actorName,
            actorVersion: definition.actorVersion,
            identity: fixtureIdentity,
            serviceName: definition.serviceName,
            sessionName: definition.sessionName,
            serviceIndex: 0,
            serviceHash:
              'f31c0c51be861af11225611526c9e2b73ab453f449950aa4ad4eaad22c522dbc',
            serviceVersion: definition.serviceVersion,
            resources,
          },
        });

        coreSession.store.setState({
          sessionId,
          identity: Schema.decodeUnknownSync(
            definition.identity.identitySchema,
          )(identity),
          serviceName: definition.serviceName,
          sessionName: definition.sessionName,
          serviceSessionLockKey,
          db,
          schema: dbConfig.schema,
          models,
          isInitialized: true,
          serviceIndex: 0,
          serviceHash:
            'f31c0c51be861af11225611526c9e2b73ab453f449950aa4ad4eaad22c522dbc',
          serviceVersion: definition.serviceVersion,
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
