import { acquireBackupWorker, type IBackupDb } from '@zerospin/backup-worker';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { bootstrapAggregateFrontendSession } from '@zerospin/frontend/bootstrapAggregateFrontendSession';
import { bootstrapServiceFrontendSession } from '@zerospin/frontend/bootstrapServiceFrontendSession';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import {
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Result,
  Schema,
  Scope,
} from 'effect';

import {
  ClerkUserIdSchema,
  userV1,
} from '../../src/zerospin/aggregates/shopper/models/user/UserV1';
import { signature } from '../../src/zerospin/signature';

import { ZerospinApp } from '@/zerospin/ZerospinApp';
const WebV2 = ZerospinApp.frontends.web.frontend;
const CatalogV1 = ZerospinApp.frontends.catalog.frontend;

const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const parameters = new URL(window.location.href).searchParams;
const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(
  `lifecycle-${parameters.get('run')}`,
);
const selection = parameters.get('selection');
let visibility = parameters.get('visibility') ?? 'visible';
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibility,
});

let controls:
  | Effect.Success<ReturnType<typeof bootstrapAggregateFrontendSession>>
  | undefined;
const scope = Scope.makeUnsafe();
Effect.runSync(Scope.addFinalizer(scope, guardTestRuntime.disposeEffect));
const aggregate = await Effect.runPromise(
  Effect.map(WebV2.initializeGuards, guards =>
    makeAggregateSession({
      runtime: guardTestRuntime,
      guards,
      frontend: WebV2,
      sessionId: `sesn_${crypto.randomUUID()}`,
      executeAggregateFrontendCommand: props => {
        if (controls === undefined) {
          throw new Error('Frontend has not bootstrapped');
        }
        return controls.executeAggregateFrontendCommand(props);
      },
    }),
  ).pipe(Scope.provide(scope)),
);
const service = makeServiceSession({
  frontend: CatalogV1,
  models: CatalogV1.models,
  sessionId: `sesn_${crypto.randomUUID()}`,
});
let initialAggregateDb: ReturnType<typeof aggregate.store.getState>['db'];
let initialServiceDb: ReturnType<typeof service.store.getState>['db'];
let acquisitions = 0;
let heldGrants = 0;
let holdAcquisitions = false;
let grantGate = Promise.withResolvers<void>();
let heldBatches = 0;
let holdBackup = false;
let backupGate = Promise.withResolvers<void>();
let previousBackup: IBackupDb | undefined;
let previousSnapshot: Uint8Array | undefined;
const publications: { kind: string; acquisitions: number }[] = [];
aggregate.store.subscribe(state => {
  if (state.sessionStatus === 'current') {
    publications.push({ kind: 'aggregate', acquisitions });
  }
});
service.store.subscribe(state => {
  if (state.sessionStatus === 'current') {
    publications.push({ kind: 'service', acquisitions });
  }
});
const props = {
  apiUrl: 'http://127.0.0.1:3035/',
  publishableKey: 'pk_test',
  systemName: 'shopping',
  authenticationLock: makeAuthenticationLock(signature),
  generateSignature: () =>
    Effect.runPromise(encodeRpc(Effect.succeed({ clerkUserId }))),
};

// These gates only delay the real capability and SQL delivery. Ownership,
// restoration, command execution, and revocation run in the production modules.
const ready = Effect.runPromise(
  Effect.gen(function* () {
    const worker = yield* acquireBackupWorker();
    const backupWorker: typeof worker = {
      ...worker,
      acquireDb: args =>
        Effect.gen(function* () {
          acquisitions++;
          const grant = yield* worker.acquireDb(args);
          if (
            grant.status === 'acquired' &&
            args.backupKey.includes('/aggregate/')
          ) {
            const actualDb = grant.db;
            previousBackup = actualDb;
            grant.db = {
              ...actualDb,
              applyStatements: batch =>
                Effect.gen(function* () {
                  if (holdBackup) {
                    heldBatches++;
                    yield* Effect.promise(() => backupGate.promise);
                  }
                  yield* actualDb.applyStatements(batch);
                }),
            };
          }
          if (holdAcquisitions) {
            heldGrants++;
            yield* Effect.promise(() => grantGate.promise);
          }
          return grant;
        }),
    };
    const results = yield* Effect.all(
      [
        selection === 'service'
          ? Effect.void
          : bootstrapAggregateFrontendSession({
              ...props,
              session: aggregate,
              aggregateVersion: WebV2.aggregateVersion,
              aggregateId: 'acct_1',
              backupWorker,
            }),
        selection === 'aggregate'
          ? Effect.void
          : bootstrapServiceFrontendSession({
              ...props,
              session: service,
              serviceVersion: CatalogV1.serviceVersion,
              backupWorker,
            }),
      ],
      { concurrency: 'unbounded' },
    );
    if (results[0] !== undefined) controls = results[0];
    initialAggregateDb = aggregate.store.getState().db;
    initialServiceDb = service.store.getState().db;
  }).pipe(
    Effect.provide(
      Layer.merge(AsyncLive, makeTelemetryLayer(makeTelemetryCollector())),
    ),
    Scope.provide(scope),
  ),
);
void ready.catch(error =>
  console.error('Frontend lifecycle fixture failed', error),
);

export const frontendLifecycleFixture = {
  ready: () => ready,
  state: () => ({
    acquisitions,
    heldGrants,
    heldBatches,
    publications,
    aggregate: {
      id: aggregate.sessionId,
      status: aggregate.store.getState().sessionStatus,
      sameDb: aggregate.store.getState().db === initialAggregateDb,
    },
    service: {
      id: service.sessionId,
      status: service.store.getState().sessionStatus,
      sameDb: service.store.getState().db === initialServiceDb,
    },
  }),
  focus: () => window.dispatchEvent(new Event('focus')),
  pageshow: () => window.dispatchEvent(new Event('pageshow')),
  visibility(value: string) {
    visibility = value;
    document.dispatchEvent(new Event('visibilitychange'));
  },
  holdGrants() {
    holdAcquisitions = true;
    grantGate = Promise.withResolvers<void>();
  },
  releaseGrants() {
    holdAcquisitions = false;
    grantGate.resolve();
  },
  async holdLocalCommand() {
    if (controls === undefined) {
      throw new Error('Frontend has not bootstrapped');
    }
    await Effect.runPromise(controls.setPushPaused({ pushPaused: true }));
    holdBackup = true;
    backupGate = Promise.withResolvers<void>();
    const result = aggregate.executeCommand({
      contractName: 'createUser',
      payload: { id: userV1.prefixId(clerkUserId), clerkUserId },
    });
    const { db } = aggregate.store.getState();
    if (db === null) throw new Error('Expected live database');
    previousSnapshot = db.$client.sqlite3.serialize(db.$client.db, 'main');
    return result;
  },
  hasCommand(id: string) {
    const { db } = aggregate.store.getState();
    if (db === null) throw new Error('Expected live database');
    return db
      .select()
      .from(sessionCommandJournalDrizzleSchema)
      .all()
      .some(row => row.id === id);
  },
  hasUser() {
    const { db } = aggregate.store.getState();
    if (db === null) throw new Error('Expected live database');
    return db
      .select()
      .from(userV1.drizzleSchema)
      .all()
      .some(row => row.id === userV1.prefixId(clerkUserId));
  },
  async overwriteFromPreviousOwner() {
    if (previousBackup === undefined || previousSnapshot === undefined) {
      throw new Error('Expected previous live snapshot');
    }
    const result = await Effect.runPromise(
      previousBackup
        .overwriteDb({ snapshot: previousSnapshot })
        .pipe(Effect.result),
    );
    return Result.isFailure(result) ? result.failure.code : 'accepted';
  },
  releaseBackup() {
    holdBackup = false;
    backupGate.resolve();
  },
  close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
};

Reflect.set(globalThis, 'frontendLifecycleFixture', frontendLifecycleFixture);
