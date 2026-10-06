import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import SQLiteFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import {
  bindAggregateSession,
  type IAggregateSessionBindingState,
  type IAggregateSessionHandoff,
} from '@zerospin/core/aggregateSession/bindAggregateSession';
import { checkGuards } from '@zerospin/core/aggregateSession/checkGuards';
import { initializeAggregateNodeProjection } from '@zerospin/core/aggregateSession/initializeAggregateNodeProjection';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { executeLocalSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/executeLocalSessionCommandTx/executeLocalSessionCommandTx';
import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { stageSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { validateSessionCommand } from '@zerospin/core/aggregateSession/validateSessionCommand';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeWaSqliteDrizzle } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type { ITx } from '@zerospin/core/drizzle/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { ContractError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { CuidFactory, primitives } from '@zerospin/shapes';
import {
  Effect,
  Layer,
  Logger,
  ManagedRuntime,
  Schema,
  SchemaGetter,
} from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hash = 'a'.repeat(64);
const time = new Date('2026-10-05T12:00:00.000Z');
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { amount: primitives.integer() },
    indexes: [],
  },
);
const claimsSchema = Schema.Struct({
  at: Schema.DateFromString,
  profile: Schema.Struct({ userId: Schema.String }),
});
const seenClaims: (typeof claimsSchema.Type)[] = [];
const add = makeContractVersion(defineContract('add'), {
  version: '1.0.0',
  models: { item },
  claims: claimsSchema,
  payload: { amount: primitives.integer() },
  program: ({ db, models, payload, claims }) =>
    Effect.gen(function* () {
      seenClaims.push(claims);
      const previous = db.query.item.findFirst().sync();
      if (previous === undefined) throw new Error('Missing fixture item');
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: previous.amount + payload.amount },
      });
    }),
});
let payloadDecodes = 0;
let claimsChecks = 0;
const guardInputs: { payload: unknown; claims: unknown }[] = [];
const programInputs: { payload: unknown; claims: unknown }[] = [];
const payloadDate = Schema.String.pipe(
  Schema.decodeTo(Schema.Date, {
    decode: SchemaGetter.transform(value => {
      payloadDecodes++;
      return new Date(value);
    }),
    encode: SchemaGetter.transform(value => value.toISOString()),
  }),
);
const prepared = makeContractVersion(defineContract('prepared'), {
  version: '1.0.0',
  claims: Schema.Struct({
    at: Schema.DateFromString.check(
      Schema.makeFilter(() => {
        claimsChecks++;
        return true;
      }),
    ),
    profile: claimsSchema.fields.profile,
  }),
  payload: {
    at: primitives.json({ schema: payloadDate }),
    label: primitives.text({ defaultValue: 'default' }),
  },
  result: Schema.DateFromString,
  guard: ({ payload, claims }) =>
    Effect.sync(() => guardInputs.push({ payload, claims })).pipe(
      Effect.asVoid,
    ),
  program: ({ payload, claims }) =>
    Effect.sync(() => {
      programInputs.push({ payload, claims });
      return payload.at;
    }),
});
let failureEncodes = 0;
let failureDecodes = 0;
const DateRejected = ContractError.schema({
  code: 'date-rejected',
  extra: Schema.Struct({
    at: Schema.String.pipe(
      Schema.decodeTo(Schema.Date, {
        decode: SchemaGetter.transform(value => {
          failureDecodes++;
          return new Date(value);
        }),
        encode: SchemaGetter.transform(value => {
          failureEncodes++;
          return value.toISOString();
        }),
      }),
    ),
  }),
});
const failing = makeContractVersion(defineContract('failing'), {
  version: '1.0.0',
  payload: {},
  models: { item },
  failures: { dateRejected: DateRejected },
  program: ({ models, failures }) =>
    Effect.gen(function* () {
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: 99 },
      });
      return yield* failures.dateRejected.make({ extra: { at: time } });
    }),
});
// Exercise an invalid runtime declaration without weakening authored contract types.
const undeclared = makeContractVersion(defineContract('undeclared'), {
  version: '1.0.0',
  payload: {},
  models: { item },
  failures: { dateRejected: DateRejected },
  program: failing.program,
});
Object.assign(undeclared, { failures: {} });
const asynchronous = makeContractVersion(defineContract('asynchronous'), {
  version: '1.0.0',
  payload: {},
  models: { item },
  program: ({ models }) =>
    Effect.gen(function* () {
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: 99 },
      });
      yield* Effect.promise(() => Promise.resolve());
    }),
});
const authoredTelemetry = makeContractVersion(
  defineContract('authoredTelemetry'),
  {
    version: '1.0.0',
    payload: { message: primitives.text() },
    program: ({ payload }) =>
      Effect.log(payload.message).pipe(
        Effect.withSpan('authored-command-span'),
      ),
  },
);
const definition = {
  kind: 'aggregate',
  systemName: 'staging-fixture',
  aggregateName: 'counter',
  aggregateVersion: '1.0.0',
  actorName: 'reader',
  actorVersion: '1.0.0',
  claimsSchema,
  sessionName: 'reader',
  contracts: {
    add,
    prepared,
    failing,
    undeclared,
    asynchronous,
    authoredTelemetry,
  },
  models: { item },
  modelNames: ['item'],
} satisfies IAggregateSessionDefinition;

const clients: Awaited<ReturnType<typeof makeInMemorySQLite3>>[] = [];
const disposers: (() => Promise<void>)[] = [];
beforeEach(() => {
  payloadDecodes = 0;
  claimsChecks = 0;
  failureEncodes = 0;
  failureDecodes = 0;
  seenClaims.length = 0;
  guardInputs.length = 0;
  programInputs.length = 0;
});
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  for (const client of clients.splice(0)) client.sqlite3.close(client.db);
});

async function fixture(
  options: {
    bind?: boolean;
    local?: boolean;
    sessionId?: `sesn_${string}`;
    handoff?: IAggregateSessionHandoff;
  } = {},
) {
  const wasmBinary = readFileSync(
    createRequire(import.meta.url).resolve(
      '@livestore/wa-sqlite/dist/wa-sqlite.wasm',
    ),
  );
  const sqlite = await makeInMemorySQLite3(() => SQLiteFactory({ wasmBinary }));
  clients.push(sqlite);
  const config = makeResourceDbConfig({
    models: { item },
    otherTables: sessionRepoDbConfig.tables,
  });
  const db = makeWaSqliteDrizzle(sqlite, config);
  Effect.runSync(provisionDb({ db, schema: config.schema }));
  const sessionId = options.sessionId ?? 'sesn_staging';
  Effect.runSync(
    initializeAggregateNodeProjection({
      db,
      definition,
      sessionId,
      snapshot: {
        identity: {
          apiUrl: 'https://fixture.invalid',
          publishableKey: 'fixture',
          systemName: definition.systemName,
          aggregateName: definition.aggregateName,
          aggregateVersion: definition.aggregateVersion,
          aggregateId: 'acct_one',
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: { at: time.toISOString(), profile: { userId: 'original' } },
          definitionHash: hash,
        },
        metadata: {
          aggregateIndex: 0,
          executedIndex: 0,
          executedHash: hash,
          changeIndex: 0,
        },
        resources: [
          {
            id: 'itm_one',
            modelName: 'item',
            version: '1.0.0',
            createdAt: time,
            updatedAt: time,
            amount: 10,
          },
        ],
        unresolvedCommands: [],
      },
    }),
  );
  const session = makeAggregateSession({ definition });
  let nextId = 0;
  const applicationLogs = vi.fn();
  const baseLayer = Layer.mergeAll(
    Layer.succeed(CuidFactory, () => Effect.sync(() => `fixture${++nextId}`)),
    Layer.succeed(MonotonicFactory, () =>
      Effect.sync(() => `fixture${++nextId}`),
    ),
    Logger.layer([Logger.make(({ message }) => applicationLogs(message))]),
  );
  const runtime = ManagedRuntime.make(
    makeTelemetryLayer(session.store.getState().telemetryCollector).pipe(
      Layer.provideMerge(baseLayer),
    ),
  );
  const state = {
    sessionId,
    aggregateId: 'acct_one',
    aggregateName: definition.aggregateName,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    claims: { at: new Date(time), profile: { userId: 'original' } },
    sessionName: definition.sessionName,
    aggregateSessionLockKey: 'fixture',
    db,
    schema: config.schema,
    models: definition.models,
    isInitialized: true,
    aggregateIndex: 0,
    executedIndex: 0,
    executedHash: hash,
    pushIndex: 0,
    sessionStatus: 'current',
    backupState: null,
  } satisfies IAggregateSessionBindingState<typeof definition>;
  let release = () => {};
  const bind = () => {
    release = bindAggregateSession({
      session,
      state,
      runtime,
      commitCommand: options.local
        ? executeLocalSessionCommandTx
        : stageSessionCommandTx,
      ...(options.handoff === undefined ? {} : { handoff: options.handoff }),
    });
    return release;
  };
  if (options.bind !== false) bind();
  disposers.push(async () => {
    release();
    await runtime.dispose();
  });
  return {
    session,
    sqlite,
    db,
    config,
    runtime,
    state,
    bind,
    release: () => release(),
    applicationLogs,
  };
}

function expectUnchanged(f: Awaited<ReturnType<typeof fixture>>) {
  expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(10);
  expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(0);
  expect(
    f.db.select().from(f.config.schema.optimisticAppliedOperations).all(),
  ).toHaveLength(0);
  expect(
    f.db.select().from(f.config.schema.sessionMetadata).get()?.nextSessionIndex,
  ).toBe(1);
}

describe('bound aggregate staging', () => {
  it('rejects staging, guard checks, and validation before initialization and after release', async () => {
    const f = await fixture({ bind: false });
    expect(f.session).not.toHaveProperty('stageCommand');
    const props = {
      session: f.session,
      contractName: 'add' as const,
      payload: { amount: 3 },
    };
    expect(stageCommand(props)).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-session-not-ready' },
    });
    expect(Effect.runSync(checkGuards(props))?.code).toBe(
      'aggregate-session-not-ready',
    );
    expect(Effect.runSync(validateSessionCommand(props))).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-session-not-ready' },
    });
    f.bind();
    expect(f.session).not.toHaveProperty('stageCommand');
    f.release();
    expect(stageCommand(props)).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-session-not-ready' },
    });
    expect(Effect.runSync(checkGuards(props))?.code).toBe(
      'aggregate-session-not-ready',
    );
    expect(Effect.runSync(validateSessionCommand(props))).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-session-not-ready' },
    });
    expectUnchanged(f);
  });

  it('rejects command operations when a bound store returns to initialization', async () => {
    const f = await fixture();
    f.session.store.setState({ isInitialized: false });
    const props = {
      session: f.session,
      contractName: 'add' as const,
      payload: { amount: 3 },
    };
    expect(stageCommand(props)).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'session-store-not-initialized' },
    });
    expect(Effect.runSync(checkGuards(props))?.code).toBe(
      'session-store-not-initialized',
    );
    expect(Effect.runSync(validateSessionCommand(props))).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'session-store-not-initialized' },
    });
    expect(() => f.session.makeId(item)).toThrow();
    expectUnchanged(f);
  });

  it('rejects retained actor identity mismatches before publishing initialization', async () => {
    const f = await fixture({ bind: false });
    f.db
      .update(f.config.schema.sessionMetadata)
      .set({ actorVersion: '9.0.0' })
      .run();
    expect(f.bind).toThrow(
      'Session identity differs from its bound definition actor',
    );
    expect(f.session.store.getState().isInitialized).toBe(false);
    expectUnchanged(f);
  });

  it('rejects a contract replaced on the exposed definition after binding', async () => {
    const f = await fixture();
    const observer = vi.fn<Parameters<typeof f.session.onStageFailure>[0]>();
    const unsubscribe = f.session.onStageFailure(observer);
    const alteredProgram = vi.fn(() => Effect.void);
    Object.defineProperty(f.session, 'definition', {
      value: {
        ...f.session.definition,
        contracts: {
          ...f.session.definition.contracts,
          add: { ...add, program: alteredProgram },
        },
      },
    });
    try {
      const rejected = stageCommand({
        session: f.session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(rejected._tag).toBe('Failure');
      if (rejected._tag !== 'Failure') {
        throw new Error('Expected rejection of the replaced contract');
      }
      expect(rejected.failure.code).toBe('contract-not-found');
      expect(alteredProgram).not.toHaveBeenCalled();
      expect(seenClaims).toHaveLength(0);
      expect(observer).toHaveBeenCalledExactlyOnceWith({
        contractName: 'add',
        failure: rejected.failure,
      });
      expect(observer.mock.calls[0]?.[0].failure).toBe(rejected.failure);
      expectUnchanged(f);
    } finally {
      unsubscribe();
    }
  });

  it.each(['released', 'superseded', 'failed', 'bootstrapping'] as const)(
    'rejects all command operations while the bound session is %s',
    async sessionStatus => {
      const f = await fixture();
      f.session.store.setState({ sessionStatus });
      const props = {
        session: f.session,
        contractName: 'add' as const,
        payload: { amount: 3 },
      };
      expect(stageCommand(props)).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-session-not-current' },
      });
      expect(Effect.runSync(checkGuards(props))?.code).toBe(
        'aggregate-session-not-current',
      );
      expect(Effect.runSync(validateSessionCommand(props))).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-session-not-current' },
      });
      expectUnchanged(f);
    },
  );

  it('binds identity and authenticated claims independently of exposed state and returned commands', async () => {
    const f = await fixture();
    const exposed = f.session.store.getState();
    if (!exposed.isInitialized) throw new Error('Expected initialized session');
    Object.assign(exposed.claims.profile, { userId: 'changed-state' });
    exposed.claims.at.setTime(9000);
    Object.assign(exposed, {
      actorName: 'changed-actor',
      actorVersion: '9.0.0',
      aggregateId: 'acct_changed',
      sessionId: 'sesn_changed',
    });
    const first = stageCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 2 },
    });
    expect(first._tag).toBe('Success');
    if (first._tag !== 'Success') {
      throw new Error('Expected successful staging');
    }
    expect(first.success).toMatchObject({
      actorName: 'reader',
      actorVersion: '1.0.0',
      aggregateId: 'acct_one',
      sessionId: f.state.sessionId,
    });
    expect(first.success.claims).toEqual({
      at: time.toISOString(),
      profile: { userId: 'original' },
    });
    const profile = first.success.claims['profile'];
    if (
      typeof profile !== 'object' ||
      profile === null ||
      !('userId' in profile)
    ) {
      throw new Error('Expected encoded profile');
    }
    profile.userId = 'changed-command';
    Object.assign(first.success.claims, { at: 'changed-command-date' });
    const second = stageCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(second._tag).toBe('Success');
    if (second._tag !== 'Success') {
      throw new Error('Expected successful staging');
    }
    expect(second.success.claims).toEqual({
      at: time.toISOString(),
      profile: { userId: 'original' },
    });
    expect(seenClaims).toEqual([f.state.claims, f.state.claims]);
    expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(15);
    const journal = f.db.select().from(f.config.schema.commands).all();
    expect(journal.map(row => row.sessionId)).toEqual([
      f.state.sessionId,
      f.state.sessionId,
    ]);
    expect(journal.map(row => JSON.parse(row.claims ?? 'null'))).toEqual([
      {
        at: time.toISOString(),
        profile: { userId: 'original' },
      },
      { at: time.toISOString(), profile: { userId: 'original' } },
    ]);
  });

  it('prepares defaults and transformed inputs once, shares them with guard/program, and preserves Date results at the journal boundary', async () => {
    const f = await fixture({ local: true });
    const result = stageCommand({
      session: f.session,
      contractName: 'prepared',
      payload: { at: time },
    });
    expect(result._tag).toBe('Success');
    if (result._tag !== 'Success') {
      throw new Error('Expected successful staging');
    }
    const typedResult: Date = result.success.staging.result;
    expect(typedResult).toEqual(time);
    expect(payloadDecodes).toBe(1);
    expect(claimsChecks).toBe(1);
    expect(guardInputs).toHaveLength(1);
    expect(programInputs).toHaveLength(1);
    expect(programInputs[0]?.payload).toBe(guardInputs[0]?.payload);
    expect(programInputs[0]?.claims).toBe(guardInputs[0]?.claims);
    expect(programInputs[0]).toEqual({
      payload: { at: time, label: 'default' },
      claims: f.state.claims,
    });
    const row = f.db.select().from(f.config.schema.commands).get();
    if (row === undefined) throw new Error('Expected journal row');
    const retained = Effect.runSync(
      sessionRepoDbConfig.tables.commands.decodeRow(row),
    );
    expect(retained.staging?.result).toBe(time.toISOString());
    expect(retained.executedIndex).toBe(0);
    expect(JSON.parse(row.payload ?? 'null')).toEqual({
      at: JSON.stringify(time.toISOString()),
      label: 'default',
    });
    expect(
      f.db.select().from(f.config.schema.optimisticAppliedOperations).all(),
    ).toHaveLength(0);
    expect(
      Effect.runSync(
        checkGuards({
          session: f.session,
          contractName: 'prepared',
          payload: { at: time },
        }),
      ),
    ).toBeNull();
    expect(
      Effect.runSync(
        validateSessionCommand({
          session: f.session,
          contractName: 'prepared',
          payload: { at: time },
        }),
      )._tag,
    ).toBe('Success');
    expect(payloadDecodes).toBe(3);
    expect(claimsChecks).toBe(3);
    expect(programInputs[1]?.payload).toBe(guardInputs[2]?.payload);
    expect(programInputs[1]?.claims).toBe(guardInputs[2]?.claims);
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(1);
  });

  it('encodes and recognizes a transformed declared failure once and notifies with that returned failure', async () => {
    const f = await fixture();
    const observer = vi.fn();
    f.session.onStageFailure(observer);
    const rejected = stageCommand({
      session: f.session,
      contractName: 'failing',
      payload: {},
    });
    expect(rejected._tag).toBe('Failure');
    if (rejected._tag !== 'Failure') {
      throw new Error('Expected business failure');
    }
    expect(rejected.failure.code).toBe('date-rejected');
    expect(rejected.failure.extra).toEqual({ at: time });
    expect(rejected.failure.toJson().extra).toEqual({ at: time.toISOString() });
    expect(failureEncodes).toBe(1);
    expect(failureDecodes).toBe(1);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]?.[0].failure).toBe(rejected.failure);
    expectUnchanged(f);
  });

  it('notifies an unexpected precommit exception once and rethrows the original error', async () => {
    const f = await fixture();
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const observerError = new Error('Failure observer exception');
    const stopThrowing = f.session.onStageFailure(() => {
      throw observerError;
    });
    const observer = vi.fn<Parameters<typeof f.session.onStageFailure>[0]>();
    const unsubscribe = f.session.onStageFailure(observer);
    const originalError = new Error('Unexpected staging runtime exception');
    const runSync = vi
      .spyOn(f.runtime, 'runSync')
      .mockImplementationOnce(() => {
        throw originalError;
      });
    try {
      const attempt = vi.fn(() =>
        stageCommand({
          session: f.session,
          contractName: 'add',
          payload: { amount: 3 },
        }),
      );
      expect(attempt).toThrow(originalError);
      expect(attempt.mock.results[0]?.value).toBe(originalError);
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer.mock.calls[0]?.[0]).toMatchObject({
        contractName: 'add',
        failure: { code: 'aggregate-command-staging-exception' },
      });
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
        'Aggregate session failure observer threw',
        observerError,
      );
      expectUnchanged(f);
    } finally {
      runSync.mockRestore();
      unsubscribe();
      stopThrowing();
      diagnostic.mockRestore();
    }
  });

  it('rolls back every write when COMMIT is rejected, notifies after rollback, and retries from the original indexes', async () => {
    const handoff = vi.fn<IAggregateSessionHandoff>();
    const f = await fixture({ handoff });
    const metadataBefore = f.db
      .select()
      .from(f.config.schema.sessionMetadata)
      .get();
    const inspectAfterRollback = makeTx(
      'AggregateStaging.inspectAfterRollback',
    )(function* (tx: ITx<typeof f.config>) {
      yield* Effect.void;
      return {
        resource: tx.select().from(f.config.schema.item).get()?.amount,
        commands: tx.select().from(f.config.schema.commands).all().length,
        inverseOperations: tx
          .select()
          .from(f.config.schema.optimisticAppliedOperations)
          .all().length,
        metadata: tx.select().from(f.config.schema.sessionMetadata).get(),
      };
    });
    const observer = vi.fn<Parameters<typeof f.session.onStageFailure>[0]>(
      () => {
        expect(Effect.runSync(inspectAfterRollback(f.db))).toEqual({
          resource: 10,
          commands: 0,
          inverseOperations: 0,
          metadata: metadataBefore,
        });
      },
    );
    const unsubscribe = f.session.onStageFailure(observer);
    let rejectCommit = true;
    // This fixture has no live query subscribers; replace its invalidation hook
    // without running SQL from SQLite's non-reentrant commit callback.
    f.sqlite.sqlite3.commit_hook(f.sqlite.db, () => {
      if (rejectCommit) {
        rejectCommit = false;
        return 1;
      }
      return 0;
    });
    try {
      const rejected = stageCommand({
        session: f.session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(rejected._tag).toBe('Failure');
      if (rejected._tag !== 'Failure') {
        throw new Error('Expected rejected COMMIT');
      }
      expect(rejected.failure.code).toBe('drizzle-transaction-failed');
      expect(rejectCommit).toBe(false);
      expectUnchanged(f);
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer.mock.results[0]?.type).toBe('return');
      expect(observer.mock.calls[0]?.[0].failure).toBe(rejected.failure);
      expect(handoff).not.toHaveBeenCalled();

      const retried = stageCommand({
        session: f.session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(retried._tag).toBe('Success');
      if (retried._tag !== 'Success') {
        throw new Error('Expected successful retry');
      }
      expect(retried.success.sessionIndex).toBe(1);
      expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(13);
      expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(
        1,
      );
      expect(
        f.db.select().from(f.config.schema.commands).get()?.sessionIndex,
      ).toBe(1);
      expect(
        f.db.select().from(f.config.schema.optimisticAppliedOperations).all(),
      ).toHaveLength(1);
      expect(
        f.db.select().from(f.config.schema.sessionMetadata).get(),
      ).toMatchObject({ nextSessionIndex: 2 });
      expect(observer).toHaveBeenCalledTimes(1);
      expect(handoff).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      f.sqlite.sqlite3.commit_hook(f.sqlite.db, null);
    }
  });

  it('rejects an undeclared failure before SQLite writes', async () => {
    const f = await fixture();
    expect(
      stageCommand({
        session: f.session,
        contractName: 'undeclared',
        payload: {},
      }),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'contract-failure-undeclared' },
    });
    expectUnchanged(f);
  });

  it('rejects an asynchronous program without applying collected operations later', async () => {
    const f = await fixture();
    expect(
      stageCommand({
        session: f.session,
        contractName: 'asynchronous',
        payload: {},
      }),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'program-must-be-synchronous' },
    });
    await Promise.resolve();
    expectUnchanged(f);
  });

  it('installs authored telemetry once per runtime while retaining application loggers and isolating sessions', async () => {
    const first = await fixture({ sessionId: 'sesn_first' });
    const second = await fixture({ sessionId: 'sesn_second' });
    expect(
      stageCommand({
        session: first.session,
        contractName: 'authoredTelemetry',
        payload: { message: 'from-first' },
      })._tag,
    ).toBe('Success');
    expect(
      stageCommand({
        session: second.session,
        contractName: 'authoredTelemetry',
        payload: { message: 'from-second' },
      })._tag,
    ).toBe('Success');
    expect(first.applicationLogs).toHaveBeenCalledExactlyOnceWith([
      'from-first',
    ]);
    expect(second.applicationLogs).toHaveBeenCalledExactlyOnceWith([
      'from-second',
    ]);
    expect(
      first.session.store.getState().telemetry.logs.map(log => log.message),
    ).toEqual(['from-first']);
    expect(
      second.session.store.getState().telemetry.logs.map(log => log.message),
    ).toEqual(['from-second']);
    expect(
      first.session.store
        .getState()
        .telemetry.spans.filter(span => span.name === 'authored-command-span'),
    ).toHaveLength(1);
    expect(
      second.session.store
        .getState()
        .telemetry.spans.filter(span => span.name === 'authored-command-span'),
    ).toHaveLength(1);
  });

  it('publishes initialization only after binding delivery and hands off committed database state', async () => {
    const handoff = vi.fn<IAggregateSessionHandoff>();
    const f = await fixture({ bind: false, handoff });
    handoff.mockImplementation(command => {
      expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(13);
      expect(f.db.select().from(f.config.schema.commands).get()?.id).toBe(
        command.id,
      );
      expect(
        f.db.select().from(f.config.schema.optimisticAppliedOperations).all(),
      ).toHaveLength(1);
    });
    const stagedAtInitialization = new Promise<void>((resolve, reject) => {
      f.session.onInitialized(() => {
        try {
          expect(
            stageCommand({
              session: f.session,
              contractName: 'add',
              payload: { amount: 3 },
            })._tag,
          ).toBe('Success');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    f.bind();
    await stagedAtInitialization;
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(handoff.mock.results[0]?.type).toBe('return');
  });
});
