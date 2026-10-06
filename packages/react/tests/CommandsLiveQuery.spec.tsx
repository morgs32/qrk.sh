import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import SQLiteFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { SessionCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { applyAggregateSessionSnapshotTx } from '@zerospin/core/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx';
import {
  bindAggregateSession,
  releaseAggregateSession,
} from '@zerospin/core/aggregateSession/bindAggregateSession';
import { decodeRetainedAggregateSessionCommand } from '@zerospin/core/aggregateSession/decodeRetainedAggregateSessionCommand';
import { getInitializedStateOrThrow } from '@zerospin/core/aggregateSession/getInitializedStateOrThrow';
import { importAggregateNodeCommands } from '@zerospin/core/aggregateSession/importAggregateNodeCommands';
import { initializeAggregateNodeProjection } from '@zerospin/core/aggregateSession/initializeAggregateNodeProjection';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { executeLocalSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/executeLocalSessionCommandTx/executeLocalSessionCommandTx';
import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { stageSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { EncodedAppliedOperationSchema } from '@zerospin/core/contracts/encodeAppliedOperation';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeWaSqliteDrizzle } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type { ITx, IWaSqliteClient } from '@zerospin/core/drizzle/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import {
  importServiceNodeCommands,
  stageServiceCommandTx,
} from '@zerospin/core/serviceSession/importServiceNodeCommands';
import { initializeServiceNodeProjection } from '@zerospin/core/serviceSession/initializeServiceNodeProjection';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import {
  ServiceCommandsRowsTable,
  SessionsCommandsRowsTable,
} from '@zerospin/devtools/sessions/sessions/sessionId/commands/SessionsCommandsRowsTable';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeZerospinError } from '@zerospin/error';
import { useLiveQueryOnDb } from '@zerospin/react/useLiveQueryOnDb';
import { CuidFactory, primitives } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const hash = 'a'.repeat(64);
const time = '2026-10-05T12:00:00.000Z';
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: {
      amount: primitives.integer(),
      capturedAt: primitives.date(),
      details: primitives.json({
        schema: Schema.Struct({ label: Schema.String }),
      }),
    },
    indexes: [],
  },
);
const parent = makeModelVersion(
  defineModel({ name: 'parent', abbreviation: 'prnt' }),
  { version: '1.0.0', attributes: { name: primitives.text() }, indexes: [] },
);
const child = makeModelVersion(
  defineModel({ name: 'child', abbreviation: 'chld' }),
  {
    version: '1.0.0',
    attributes: {
      parentId: primitives.ref({
        table: parent.table,
        relation: 'parent',
        inverse: 'children',
        nullable: false,
      }),
    },
    indexes: [],
  },
);
const baselineParent = {
  id: 'prnt_one',
  modelName: 'parent',
  version: '1.0.0',
  createdAt: new Date(time),
  updatedAt: new Date(time),
  name: 'Parent',
};
const baselineChild = {
  id: 'chld_one',
  modelName: 'child',
  version: '1.0.0',
  createdAt: new Date(time),
  updatedAt: new Date(time),
  parentId: 'prnt_one',
};
const add = makeContractVersion(defineContract('add'), {
  version: '1.0.0',
  payload: { amount: primitives.integer() },
  models: { item },
  program: ({ db, payload, models }) =>
    Effect.gen(function* () {
      const row = db.query.item
        .findFirst({ where: { id: { eq: 'itm_one' } } })
        .sync();
      if (row === undefined) {
        return yield* makeZerospinError('fixture-resource-missing');
      }
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: row.amount + payload.amount },
      });
    }),
});
const resource = (amount: number) => ({
  id: 'itm_one',
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date(time),
  updatedAt: new Date(time),
  amount,
  capturedAt: new Date(amount * 100).toISOString(),
  details: JSON.stringify({ label: String(amount) }),
});
const common = {
  systemName: 'fixture',
  actorName: 'reader',
  actorVersion: '1.0.0',
  claimsSchema: Schema.Struct({}),
  sessionName: 'reader',
  contracts: { add },
  models: { item },
  modelNames: ['item'],
};
const aggregateDefinition = {
  ...common,
  kind: 'aggregate',
  aggregateName: 'counter',
  aggregateVersion: '1.0.0',
} satisfies IAggregateSessionDefinition;
const serviceDefinition = {
  ...common,
  kind: 'service',
  serviceName: 'counters',
  serviceVersion: '1.0.0',
} satisfies IServiceSessionDefinition;
const identity = {
  apiUrl: 'https://fixture.invalid',
  publishableKey: 'fixture',
  systemName: 'fixture',
  actorName: 'reader',
  actorVersion: '1.0.0',
  sessionName: 'reader',
  claims: {},
  definitionHash: hash,
};
const staging = {
  result: null,
  startedAt: time,
  completedAt: time,
  stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
};
const input = {
  id: 'cmd_pending' as const,
  commandName: 'add',
  contractVersion: '1.0.0',
  payload: '{"amount":3}',
  actorName: 'reader',
  actorVersion: '1.0.0',
  sessionName: 'reader',
  claims: {},
  staging,
};
const clients: Awaited<ReturnType<typeof makeInMemorySQLite3>>[] = [];
afterEach(() => {
  cleanup();
  zerospinDevtoolsStore.getState().removeServiceSession('sesn_service');
  for (const client of clients.splice(0)) client.sqlite3.close(client.db);
});
async function client() {
  const wasmBinary = readFileSync(
    createRequire(import.meta.url).resolve(
      '@livestore/wa-sqlite/dist/wa-sqlite.wasm',
    ),
  );
  const result = await makeInMemorySQLite3(() => SQLiteFactory({ wasmBinary }));
  clients.push(result);
  return result;
}

async function aggregateStagingFixture() {
  const sqlite = await client();
  const config = makeResourceDbConfig({
    models: { item },
    otherTables: sessionRepoDbConfig.tables,
  });
  const db = makeWaSqliteDrizzle(sqlite, config);
  Effect.runSync(provisionDb({ db, schema: config.schema }));
  Effect.runSync(
    initializeAggregateNodeProjection({
      db,
      definition: aggregateDefinition,
      sessionId: 'sesn_aggregate',
      snapshot: {
        identity: {
          ...identity,
          aggregateName: 'counter',
          aggregateVersion: '1.0.0',
          aggregateId: 'acct_one',
        },
        metadata: {
          aggregateIndex: 0,
          executedIndex: 0,
          executedHash: hash,
          changeIndex: 0,
        },
        resources: [resource(10)],
        unresolvedCommands: [],
      },
    }),
  );
  const session = makeAggregateSession({ definition: aggregateDefinition });
  session.store.setState({
    sessionId: 'sesn_aggregate',
    aggregateId: 'acct_one',
    aggregateName: 'counter',
    actorName: 'reader',
    actorVersion: '1.0.0',
    claims: {},
    sessionName: 'reader',
    aggregateSessionLockKey: 'fixture',
    db,
    schema: config.schema,
    models: aggregateDefinition.models,
    isInitialized: true,
    aggregateIndex: 0,
    executedIndex: 0,
    executedHash: hash,
    pushIndex: 0,
    sessionStatus: 'current',
  });
  const runtime = ManagedRuntime.make(
    Layer.merge(
      Layer.succeed(CuidFactory, () => Effect.succeed('reply')),
      Layer.succeed(MonotonicFactory, () => Effect.succeed('reply')),
    ),
  );
  bindAggregateSession({
    session,
    runtime,
    state: getInitializedStateOrThrow({ session }),
    commitCommand: stageSessionCommandTx,
  });
  return { session, db, config, runtime };
}

function BaselineChildRows(props: {
  db: { $client: IWaSqliteClient };
  query: () => {
    readonly _: { readonly result: { id: string }[] };
    all(): { id: string }[];
  };
}) {
  const { data } = useLiveQueryOnDb({
    db: props.db,
    query: () => props.query(),
    tableNames: ['parent', 'child'],
  });
  return (
    <div>
      {data.map(row => (
        <span key={row.id}>{row.id}</span>
      ))}
    </div>
  );
}

describe('live Commands views with tab SQLite', () => {
  it('allocates one retention sequence across received input and local staging while replaying in Node order', async () => {
    const { session, db, config, runtime } = await aggregateStagingFixture();
    const later = {
      ...input,
      id: 'cmd_later' as const,
      aggregateId: 'acct_one',
      aggregateName: 'counter',
      nodeId: 'node_fixture',
      nodeIndex: 2,
      admissionIndex: 2,
    };
    const earlier = {
      ...later,
      id: 'cmd_earlier' as const,
      nodeIndex: 1,
      admissionIndex: 1,
    };
    try {
      Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [later],
          throughChangeIndex: 1,
        }),
      );
      const local = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 5 },
      });
      if (local._tag !== 'Success') {
        throw new Error('Fixture local staging failed');
      }
      expect(local.success.sessionIndex).toBe(2);
      Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [earlier, later],
          throughChangeIndex: 3,
        }),
      );
      const rows = db
        .select()
        .from(config.schema.commands)
        .orderBy(config.schema.commands.sessionIndex)
        .all();
      expect(
        rows.map(row => [row.id, row.sessionIndex, row.sessionId]),
      ).toEqual([
        ['cmd_later', 1, null],
        [local.success.id, 2, 'sesn_aggregate'],
        ['cmd_earlier', 3, null],
      ]);
      expect(
        db.select().from(config.schema.sessionMetadata).get(),
      ).toMatchObject({ nextSessionIndex: 4, changeIndex: 3 });
      expect(db.select().from(config.schema.item).get()?.amount).toBe(21);
      const inverseAmounts = db
        .select()
        .from(config.schema.optimisticAppliedOperations)
        .orderBy(config.schema.optimisticAppliedOperations.sessionIndex)
        .all()
        .map(row => {
          const [operation] = Schema.decodeUnknownSync(
            Schema.fromJsonString(Schema.Array(EncodedAppliedOperationSchema)),
          )(row.operations);
          if (operation === undefined) {
            throw new Error('Fixture inverse missing');
          }
          const inverse = Schema.decodeUnknownSync(
            Schema.fromJsonString(
              Schema.Struct({
                encodedAttributes: Schema.Struct({ amount: Schema.Number }),
              }),
            ),
          )(operation.inverseOperation);
          return [row.sessionIndex, inverse.encodedAttributes.amount];
        });
      // Node submission 1 precedes 2 even though retained rows arrived in reverse order.
      // Uncertain local work follows both, using its retained key for inverse ownership.
      expect(inverseAmounts).toEqual([
        [1, 13],
        [2, 16],
        [3, 10],
      ]);
      const second = await aggregateStagingFixture();
      try {
        Effect.runSync(
          importAggregateNodeCommands({
            db: second.db,
            definition: aggregateDefinition,
            sessionId: 'sesn_aggregate',
            commands: [earlier, later],
          }),
        );
        expect(
          second.db
            .select()
            .from(second.config.schema.commands)
            .all()
            .map(row => [row.id, row.sessionIndex]),
        ).toEqual([
          ['cmd_earlier', 1],
          ['cmd_later', 2],
        ]);
      } finally {
        releaseAggregateSession(second.session);
        await second.runtime.dispose();
      }
    } finally {
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });

  it('recovers only the selected row when a later terminal occurrence shares its command ID', async () => {
    const { session, db, config, runtime } = await aggregateStagingFixture();
    try {
      const staged = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      if (staged._tag !== 'Success') throw new Error('Fixture staging failed');
      const original = {
        id: staged.success.id,
        commandName: 'add',
        delta: { upserted: [resource(13)], deleted: [] },
        admission: null,
        execution: null,
        executedIndex: 1,
        aggregateIndex: 1,
        executedHash: hash,
      };
      const repeated = {
        ...original,
        executedIndex: 2,
        aggregateIndex: 2,
        delta: { upserted: [resource(17)], deleted: [] },
      };
      Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [original, repeated],
        }),
      );
      db.update(config.schema.commands)
        .set({ admissionIndex: 1 })
        .where(sql`${config.schema.commands.sessionIndex} = 1`)
        .run();
      const before = db.select().from(config.schema.commands).all();
      Effect.runSync(
        applyAggregateSessionSnapshotTx(db, {
          sessionId: 'sesn_aggregate',
          models: aggregateDefinition.models,
          definition: aggregateDefinition,
          snapshot: {
            aggregateId: 'acct_one',
            aggregateName: 'counter',
            aggregateVersion: '1.0.0',
            actorName: 'reader',
            actorVersion: '1.0.0',
            sessionName: 'reader',
            claims: {},
            aggregateIndex: 2,
            executedIndex: 2,
            executedHash: hash,
            resolvedThrough: 1,
            resources: [{ ...resource(17), capturedAt: new Date(1700) }],
          },
          outcomes: [original],
        }),
      );
      expect(db.select().from(config.schema.commands).all()).toEqual(before);
      expect(
        db.select().from(config.schema.sessionMetadata).get()?.nextSessionIndex,
      ).toBe(3);
      expect(db.select().from(config.schema.item).get()?.amount).toBe(17);
    } finally {
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid or exhausted aggregate retention allocator %s without publishing',
    async nextSessionIndex => {
      const { session, db, config, runtime } = await aggregateStagingFixture();
      try {
        db.update(config.schema.sessionMetadata)
          .set({ nextSessionIndex })
          .run();
        const metadata = db.select().from(config.schema.sessionMetadata).get();
        const publish = vi.fn();
        const unsubscribe = db.$client.subscribeToTableChanges(publish);
        try {
          const staged = stageCommand({
            session,
            contractName: 'add',
            payload: { amount: 3 },
          });
          expect(staged).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'session-index-invalid' },
          });
          const imported = Effect.runSync(
            importAggregateNodeCommands({
              db,
              definition: aggregateDefinition,
              sessionId: 'sesn_aggregate',
              commands: [
                {
                  id: 'cmd_invalid',
                  commandName: 'add',
                  delta: { upserted: [resource(20)], deleted: [] },
                  admission: null,
                  execution: null,
                  executedIndex: 1,
                  aggregateIndex: 1,
                  executedHash: hash,
                },
              ],
              throughChangeIndex: 1,
            }).pipe(Effect.result),
          );
          expect(imported).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'session-index-invalid' },
          });
          expect(db.select().from(config.schema.commands).all()).toHaveLength(
            0,
          );
          expect(
            db.select().from(config.schema.optimisticAppliedOperations).all(),
          ).toHaveLength(0);
          expect(db.select().from(config.schema.sessionMetadata).get()).toEqual(
            metadata,
          );
          expect(db.select().from(config.schema.item).get()?.amount).toBe(10);
          expect(publish).not.toHaveBeenCalled();
        } finally {
          unsubscribe();
        }
      } finally {
        releaseAggregateSession(session);
        await runtime.dispose();
      }
    },
  );

  it('rejects an occupied aggregate allocator without replacing retained history or optimism', async () => {
    const { session, db, config, runtime } = await aggregateStagingFixture();
    try {
      const retained = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      if (retained._tag !== 'Success') {
        throw new Error('Fixture staging failed');
      }
      db.update(config.schema.sessionMetadata)
        .set({ nextSessionIndex: 1 })
        .run();
      const metadata = db.select().from(config.schema.sessionMetadata).get();
      const rows = db.select().from(config.schema.commands).all();
      const inverses = db
        .select()
        .from(config.schema.optimisticAppliedOperations)
        .all();
      const before = db.select().from(config.schema.item).get();
      const publish = vi.fn();
      const unsubscribe = db.$client.subscribeToTableChanges(publish);
      try {
        expect(
          stageCommand({ session, contractName: 'add', payload: { amount: 5 } })
            ._tag,
        ).toBe('Failure');
        expect(
          Effect.runSync(
            importAggregateNodeCommands({
              db,
              definition: aggregateDefinition,
              sessionId: 'sesn_aggregate',
              commands: [
                {
                  id: 'cmd_collision',
                  commandName: 'add',
                  delta: { upserted: [resource(30)], deleted: [] },
                  admission: null,
                  execution: null,
                  executedIndex: 1,
                  aggregateIndex: 1,
                  executedHash: hash,
                },
              ],
              throughChangeIndex: 1,
            }).pipe(Effect.result),
          )._tag,
        ).toBe('Failure');
        expect(db.select().from(config.schema.commands).all()).toEqual(rows);
        expect(
          db.select().from(config.schema.optimisticAppliedOperations).all(),
        ).toEqual(inverses);
        expect(db.select().from(config.schema.sessionMetadata).get()).toEqual(
          metadata,
        );
        expect(db.select().from(config.schema.item).get()).toEqual(before);
        expect(publish).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    } finally {
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    'occupied',
  ])(
    'rejects a service retention allocator %s without changing committed history',
    async nextSessionIndex => {
      const sqlite = await client();
      const config = makeResourceDbConfig({
        models: { item },
        otherTables: serviceSessionRepoTables,
      });
      const db = makeWaSqliteDrizzle(sqlite, config);
      Effect.runSync(provisionDb({ db, schema: config.schema }));
      Effect.runSync(
        initializeServiceNodeProjection({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          snapshot: {
            identity: {
              ...identity,
              serviceName: 'counters',
              serviceVersion: '1.0.0',
            },
            metadata: {
              serviceIndex: 0,
              executedIndex: 0,
              serviceHash: hash,
              changeIndex: 0,
            },
            resources: [resource(10)],
            unresolvedCommands: [],
          },
        }),
      );
      if (nextSessionIndex === 'occupied') {
        Effect.runSync(
          stageServiceCommandTx({
            db,
            definition: serviceDefinition,
            sessionId: 'sesn_service',
            command: { ...input, serviceName: 'counters' },
          }),
        );
      }
      db.update(config.schema.serviceSessionMetadata)
        .set({
          nextSessionIndex:
            typeof nextSessionIndex === 'number' ? nextSessionIndex : 1,
        })
        .run();
      const metadata = db
        .select()
        .from(config.schema.serviceSessionMetadata)
        .get();
      const rows = db.select().from(config.schema.commands).all();
      const inverses = db
        .select()
        .from(config.schema.optimisticAppliedOperations)
        .all();
      const before = db.select().from(config.schema.item).get();
      const publish = vi.fn();
      const unsubscribe = db.$client.subscribeToTableChanges(publish);
      try {
        const imported = Effect.runSync(
          importServiceNodeCommands({
            db,
            definition: serviceDefinition,
            sessionId: 'sesn_service',
            commands: [
              {
                id: 'cmd_invalid',
                commandName: 'add',
                delta: { upserted: [resource(30)], deleted: [] },
                admission: null,
                execution: null,
                executedIndex: 1,
                serviceIndex: 1,
                serviceHash: hash,
              },
            ],
            throughChangeIndex: 1,
          }).pipe(Effect.result),
        );
        expect(imported._tag).toBe('Failure');
        if (typeof nextSessionIndex === 'number') {
          expect(imported).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'session-index-invalid' },
          });
        }
        expect(db.select().from(config.schema.commands).all()).toEqual(rows);
        expect(
          db.select().from(config.schema.optimisticAppliedOperations).all(),
        ).toEqual(inverses);
        expect(
          db.select().from(config.schema.serviceSessionMetadata).get(),
        ).toEqual(metadata);
        expect(db.select().from(config.schema.item).get()).toEqual(before);
        expect(publish).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    },
  );

  it('notifies returned staging failures once without changing SQLite, releases subscriptions, and isolates observers', async () => {
    const fixture = await aggregateStagingFixture();
    const { session, db, config, runtime } = fixture;
    try {
      const observer = vi.fn<Parameters<typeof session.onStageFailure>[0]>(
        event => {
          expect(db.select().from(config.schema.commands).all()).toHaveLength(
            0,
          );
          expect(db.select().from(config.schema.item).get()?.amount).toBe(10);
          return event;
        },
      );
      const unsubscribe = session.onStageFailure(observer);
      session.store.setState({ sessionStatus: 'failed' });
      const rejected = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(rejected._tag).toBe('Failure');
      if (rejected._tag !== 'Failure') {
        throw new Error('Expected staging to reject the failed session');
      }
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer.mock.results[0]?.type).toBe('return');
      expect(observer.mock.calls[0]?.[0]).toEqual({
        contractName: 'add',
        failure: rejected.failure,
      });
      expect(observer.mock.calls[0]?.[0].failure).toBe(rejected.failure);
      unsubscribe();
      stageCommand({ session, contractName: 'add', payload: { amount: 3 } });
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer.mock.results[0]?.type).toBe('return');

      const diagnostic = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const throwingObserver = session.onStageFailure(() => {
        throw new Error('Observer exploded');
      });
      const survivingObserver = vi.fn();
      const stopSurviving = session.onStageFailure(survivingObserver);
      const isolated = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(isolated._tag).toBe('Failure');
      expect(survivingObserver).toHaveBeenCalledTimes(1);
      expect(diagnostic).toHaveBeenCalledWith(
        'Aggregate session failure observer threw',
        expect.any(Error),
      );
      throwingObserver();
      stopSurviving();
      const unexpected = new Error('Runtime exploded');
      const exceptionObserver =
        vi.fn<Parameters<typeof session.onStageFailure>[0]>();
      const stopException = session.onStageFailure(exceptionObserver);
      vi.spyOn(runtime, 'runSync').mockImplementationOnce(() => {
        throw unexpected;
      });
      expect(() =>
        stageCommand({ session, contractName: 'add', payload: { amount: 3 } }),
      ).toThrow(unexpected);
      expect(exceptionObserver).toHaveBeenCalledTimes(1);
      expect(exceptionObserver.mock.calls[0]?.[0]).toMatchObject({
        contractName: 'add',
        failure: { code: 'aggregate-command-staging-exception' },
      });
      stopException();
      expect(db.select().from(config.schema.commands).all()).toHaveLength(0);
    } finally {
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });

  it('notifies a failed SQLite commit after rollback and permits a successful retry', async () => {
    const { session, db, config, runtime } = await aggregateStagingFixture();
    const metadataBefore = db
      .select()
      .from(config.schema.sessionMetadata)
      .get();
    const readAfterRollback = makeTx('stage-notification-read')(function* (
      tx: ITx<typeof config>,
    ) {
      yield* Effect.void;
      return tx.select().from(config.schema.item).get()?.amount;
    });
    const observer = vi.fn<Parameters<typeof session.onStageFailure>[0]>(() => {
      // A second production transaction cannot start while staging still owns its transaction.
      expect(Effect.runSync(readAfterRollback(db))).toBe(10);
      expect(db.select().from(config.schema.commands).all()).toHaveLength(0);
      expect(db.select().from(config.schema.sessionMetadata).get()).toEqual(
        metadataBefore,
      );
    });
    const unsubscribe = session.onStageFailure(observer);
    try {
      db.run(
        sql.raw(
          "CREATE TRIGGER fixture_reject_command AFTER INSERT ON commands BEGIN SELECT RAISE(ABORT, 'fixture-command-commit-blocked'); END",
        ),
      );
      const rejected = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(rejected._tag).toBe('Failure');
      if (rejected._tag !== 'Failure') {
        throw new Error('Expected SQLite trigger rejection');
      }
      expect(rejected.failure.code).toBe('drizzle-transaction-failed');
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer.mock.results[0]?.type).toBe('return');
      expect(observer.mock.calls[0]?.[0].failure).toBe(rejected.failure);
      db.run(sql.raw('DROP TRIGGER fixture_reject_command'));
      const retried = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(retried._tag).toBe('Success');
      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer.mock.results[0]?.type).toBe('return');
      expect(db.select().from(config.schema.item).get()?.amount).toBe(13);
      expect(db.select().from(config.schema.commands).all()).toHaveLength(1);
      expect(
        db.select().from(config.schema.sessionMetadata).get()?.nextSessionIndex,
      ).toBe(2);
    } finally {
      unsubscribe();
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });

  it('uses the exact returned failure when execution resources have not been initialized', () => {
    const session = makeAggregateSession({ definition: aggregateDefinition });
    const observer = vi.fn<Parameters<typeof session.onStageFailure>[0]>();
    const unsubscribe = session.onStageFailure(observer);
    const result = stageCommand({
      session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(result._tag).toBe('Failure');
    if (result._tag !== 'Failure') {
      throw new Error('Expected an uninitialized staging failure');
    }
    expect(result.failure.code).toBe('aggregate-session-not-ready');
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]?.[0].failure).toBe(result.failure);
    unsubscribe();
    stageCommand({ session, contractName: 'add', payload: { amount: 3 } });
    expect(observer).toHaveBeenCalledTimes(1);
  });

  it('commits child-before-parent aggregate baselines and rolls back broken references silently', async () => {
    const sqlite = await client();
    const models = { parent, child };
    const definition = {
      ...aggregateDefinition,
      contracts: {},
      models,
      modelNames: ['parent', 'child'],
    } satisfies IAggregateSessionDefinition;
    const config = makeResourceDbConfig({
      models,
      otherTables: sessionRepoDbConfig.tables,
    });
    const db = makeWaSqliteDrizzle(sqlite, config);
    Effect.runSync(provisionDb({ db, schema: config.schema }));
    const snapshot = {
      identity: {
        ...identity,
        aggregateName: 'counter',
        aggregateVersion: '1.0.0',
        aggregateId: 'acct_one',
      },
      metadata: {
        aggregateIndex: 12,
        executedIndex: 4,
        executedHash: hash,
        changeIndex: 16,
      },
      resources: [baselineChild, baselineParent],
      unresolvedCommands: [],
    };
    const notifications = vi.fn();
    const unsubscribe = sqlite.subscribeToTableChanges(notifications);
    const mounted = render(
      <BaselineChildRows
        db={db}
        query={() =>
          db.select({ id: config.schema.child.id }).from(config.schema.child)
        }
      />,
    );
    act(() => {
      const result = Effect.runSync(
        initializeAggregateNodeProjection({
          db,
          definition,
          sessionId: 'sesn_baseline',
          snapshot: {
            ...snapshot,
            resources: [
              { ...baselineChild, parentId: 'prnt_missing' },
              baselineParent,
            ],
          },
        }).pipe(Effect.result),
      );
      expect(result._tag).toBe('Failure');
    });
    expect(notifications).not.toHaveBeenCalled();
    expect(screen.queryByText('chld_one')).toBeNull();
    expect(db.select().from(config.schema.child).all()).toHaveLength(0);
    expect(db.select().from(config.schema.parent).all()).toHaveLength(0);
    expect(db.select().from(config.schema.sessionMetadata).all()).toHaveLength(
      0,
    );
    act(() =>
      Effect.runSync(
        initializeAggregateNodeProjection({
          db,
          definition,
          sessionId: 'sesn_baseline',
          snapshot,
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText('chld_one')).toBeTruthy());
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(db.select().from(config.schema.sessionMetadata).get()).toMatchObject(
      snapshot.metadata,
    );
    mounted.unmount();
    unsubscribe();
  });

  it('commits child-before-parent service baselines and rolls back broken references silently', async () => {
    const sqlite = await client();
    const models = { parent, child };
    const definition = {
      ...serviceDefinition,
      contracts: {},
      models,
      modelNames: ['parent', 'child'],
    } satisfies IServiceSessionDefinition;
    const config = makeResourceDbConfig({
      models,
      otherTables: serviceSessionRepoTables,
    });
    const db = makeWaSqliteDrizzle(sqlite, config);
    Effect.runSync(provisionDb({ db, schema: config.schema }));
    const snapshot = {
      identity: {
        ...identity,
        serviceName: 'counters',
        serviceVersion: '1.0.0',
      },
      metadata: {
        serviceIndex: 12,
        executedIndex: 4,
        serviceHash: hash,
        changeIndex: 16,
      },
      resources: [baselineChild, baselineParent],
      unresolvedCommands: [],
    };
    const notifications = vi.fn();
    const unsubscribe = sqlite.subscribeToTableChanges(notifications);
    const mounted = render(
      <BaselineChildRows
        db={db}
        query={() =>
          db.select({ id: config.schema.child.id }).from(config.schema.child)
        }
      />,
    );
    act(() => {
      const result = Effect.runSync(
        initializeServiceNodeProjection({
          db,
          definition,
          sessionId: 'sesn_baseline',
          snapshot: {
            ...snapshot,
            resources: [
              { ...baselineChild, parentId: 'prnt_missing' },
              baselineParent,
            ],
          },
        }).pipe(Effect.result),
      );
      expect(result._tag).toBe('Failure');
    });
    expect(notifications).not.toHaveBeenCalled();
    expect(screen.queryByText('chld_one')).toBeNull();
    expect(db.select().from(config.schema.child).all()).toHaveLength(0);
    expect(db.select().from(config.schema.parent).all()).toHaveLength(0);
    expect(
      db.select().from(config.schema.serviceSessionMetadata).all(),
    ).toHaveLength(0);
    act(() =>
      Effect.runSync(
        initializeServiceNodeProjection({
          db,
          definition,
          sessionId: 'sesn_baseline',
          snapshot,
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText('chld_one')).toBeTruthy());
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(
      db.select().from(config.schema.serviceSessionMetadata).get(),
    ).toMatchObject(snapshot.metadata);
    mounted.unmount();
    unsubscribe();
  });

  it('keeps aggregate occurrence rows through duplicates, rollback, and remount', async () => {
    const sqlite = await client();
    const config = makeResourceDbConfig({
      models: { item },
      otherTables: sessionRepoDbConfig.tables,
    });
    const db = makeWaSqliteDrizzle(sqlite, config);
    Effect.runSync(provisionDb({ db, schema: config.schema }));
    Effect.runSync(
      initializeAggregateNodeProjection({
        db,
        definition: aggregateDefinition,
        sessionId: 'sesn_aggregate',
        snapshot: {
          identity: {
            ...identity,
            aggregateName: 'counter',
            aggregateVersion: '1.0.0',
            aggregateId: 'acct_one',
          },
          metadata: {
            aggregateIndex: 0,
            executedIndex: 0,
            executedHash: hash,
            changeIndex: 0,
          },
          resources: [resource(10)],
          unresolvedCommands: [],
        },
      }),
    );
    const session = makeAggregateSession({ definition: aggregateDefinition });
    session.store.setState({
      sessionId: 'sesn_aggregate',
      aggregateId: 'acct_one',
      aggregateName: 'counter',
      actorName: 'reader',
      actorVersion: '1.0.0',
      claims: {},
      sessionName: 'reader',
      aggregateSessionLockKey: 'fixture',
      db,
      schema: config.schema,
      models: aggregateDefinition.models,
      isInitialized: true,
      aggregateIndex: 0,
      executedIndex: 0,
      executedHash: hash,
      pushIndex: 0,
      sessionStatus: 'current',
    });
    const subscribe = sqlite.subscribeToTableChanges.bind(sqlite);
    const unsubscribeCalls: ReturnType<typeof vi.fn>[] = [];
    const subscriptions = vi
      .spyOn(sqlite, 'subscribeToTableChanges')
      .mockImplementation(listener => {
        const unsubscribe = vi.fn(subscribe(listener));
        unsubscribeCalls.push(unsubscribe);
        return unsubscribe;
      });
    let mounted = render(<SessionsCommandsRowsTable session={session} />);
    const first = {
      id: 'cmd_same' as const,
      commandName: 'add',
      delta: { upserted: [resource(11)], deleted: [] },
      admission: null,
      execution: null,
      executedIndex: 1,
      aggregateIndex: 1,
      executedHash: hash,
    };
    act(() =>
      Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [first],
          throughChangeIndex: 1,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByText('cmd_same')).toHaveLength(1),
    );
    expect(db.select().from(config.schema.commands).get()?.payload).toBeNull();
    expect(db.select().from(config.schema.commands).get()).toMatchObject({
      sessionIndex: 1,
      sessionId: null,
    });
    const firstRowElement = screen.getByText('cmd_same').closest('tr');
    act(() =>
      Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [first, { ...first, executedIndex: 2, aggregateIndex: 2 }],
          throughChangeIndex: 2,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByText('cmd_same')).toHaveLength(2),
    );
    expect(screen.getAllByText('cmd_same')[0]?.closest('tr')).toBe(
      firstRowElement,
    );
    const retainedBefore = db.select().from(config.schema.commands).all();
    expect(retainedBefore.map(row => row.sessionIndex)).toEqual([1, 2]);
    const metadataBefore = db
      .select()
      .from(config.schema.sessionMetadata)
      .get();
    expect(metadataBefore?.nextSessionIndex).toBe(3);
    const inverseBefore = db
      .select()
      .from(config.schema.optimisticAppliedOperations)
      .all();
    const resourceBefore = db.select().from(config.schema.item).get();
    const publish = vi.fn();
    const stopPublish = subscribe(publish);
    const renderedBefore = screen.getAllByText('cmd_same').length;
    act(() => {
      const result = Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [
            {
              ...first,
              id: 'cmd_rollback',
              executedIndex: 3,
              aggregateIndex: 3,
            },
            { ...first, id: 'cmd_gap', executedIndex: 5, aggregateIndex: 5 },
          ],
          throughChangeIndex: 4,
        }).pipe(Effect.result),
      );
      expect(result._tag).toBe('Failure');
    });
    expect(publish).not.toHaveBeenCalled();
    stopPublish();
    expect(db.select().from(config.schema.commands).all()).toEqual(
      retainedBefore,
    );
    expect(db.select().from(config.schema.sessionMetadata).get()).toEqual(
      metadataBefore,
    );
    expect(
      db.select().from(config.schema.optimisticAppliedOperations).all(),
    ).toEqual(inverseBefore);
    expect(db.select().from(config.schema.item).get()).toEqual(resourceBefore);
    expect(screen.queryByText('cmd_rollback')).toBeNull();
    expect(screen.getAllByText('cmd_same')).toHaveLength(renderedBefore);
    expect(
      db.select().from(config.schema.sessionMetadata).get()?.changeIndex,
    ).toBe(2);
    mounted.unmount();
    expect(unsubscribeCalls[0]).toHaveBeenCalledTimes(1);
    mounted = render(<SessionsCommandsRowsTable session={session} />);
    await waitFor(() =>
      expect(screen.getAllByText('cmd_same')).toHaveLength(2),
    );
    expect(subscriptions).toHaveBeenCalledTimes(2);
    mounted.unmount();
    expect(unsubscribeCalls[1]).toHaveBeenCalledTimes(1);
    act(() =>
      Effect.runSync(
        importAggregateNodeCommands({
          db,
          definition: aggregateDefinition,
          sessionId: 'sesn_aggregate',
          commands: [
            {
              ...first,
              id: 'cmd_disposed',
              executedIndex: 3,
              aggregateIndex: 3,
            },
          ],
        }),
      ),
    );
    expect(screen.queryByText('cmd_disposed')).toBeNull();
    expect(
      db
        .select()
        .from(config.schema.commands)
        .all()
        .map(row => row.sessionIndex),
    ).toEqual([1, 2, 3]);
    expect(
      db.select().from(config.schema.sessionMetadata).get()?.nextSessionIndex,
    ).toBe(4);
    const runtime = ManagedRuntime.make(
      Layer.merge(
        Layer.succeed(CuidFactory, () => Effect.succeed('reply')),
        Layer.succeed(MonotonicFactory, () => Effect.succeed('reply')),
      ),
    );
    bindAggregateSession({
      session,
      runtime,
      state: getInitializedStateOrThrow({ session }),
      commitCommand: stageSessionCommandTx,
    });
    try {
      const staged = stageCommand({
        session,
        contractName: 'add',
        payload: { amount: 3 },
      });
      expect(staged._tag).toBe('Success');
      if (staged._tag !== 'Success') throw new Error('Fixture staging failed');
      expect(staged.success.sessionIndex).toBe(4);
      expect(
        db
          .select()
          .from(config.schema.optimisticAppliedOperations)
          .all()
          .map(row => row.sessionIndex),
      ).toEqual([4]);
      const retained = db
        .select()
        .from(config.schema.commands)
        .all()
        .find(row => row.id === staged.success.id);
      if (retained === undefined) throw new Error('Fixture command missing');
      const {
        sessionId: _sessionId,
        sessionIndex: _sessionIndex,
        pushIndex: _pushIndex,
        ...nodeInput
      } = Schema.encodeSync(SessionCommandSchema)(
        Effect.runSync(decodeRetainedAggregateSessionCommand(retained)),
      );
      expect(db.select().from(config.schema.item).get()?.amount).toBe(14);
      expect(db.select().from(config.schema.item).get()?.capturedAt).toEqual(
        new Date(1100),
      );
      expect(db.select().from(config.schema.item).get()?.details).toBe(
        '{"label":"11"}',
      );
      act(() =>
        Effect.runSync(
          importAggregateNodeCommands({
            db,
            definition: aggregateDefinition,
            sessionId: 'sesn_aggregate',
            commands: [
              {
                id: nodeInput.id,
                commandName: 'add',
                delta: { upserted: [], deleted: [] },
                admission: {
                  status: 'succeeded',
                  startedAt: new Date(time),
                  completedAt: new Date(time),
                },
                execution: {
                  status: 'failed',
                  startedAt: new Date(time),
                  completedAt: new Date(time),
                  failure: {
                    _tag: 'ZerospinError',
                    code: 'operation-row-not-found',
                    message: 'Missing row',
                    status: 400,
                    extra: null,
                  },
                },
                executedIndex: 4,
                aggregateIndex: 4,
                executedHash: hash,
              },
              {
                ...nodeInput,
                nodeId: 'node_fixture',
                nodeIndex: 1,
                admissionIndex: 3,
              },
            ],
          }),
        ),
      );
      expect(db.select().from(config.schema.item).get()?.amount).toBe(11);
      expect(db.select().from(config.schema.item).get()?.capturedAt).toEqual(
        new Date(1100),
      );
      expect(db.select().from(config.schema.item).get()?.details).toBe(
        '{"label":"11"}',
      );
      const settled = db
        .select()
        .from(config.schema.commands)
        .all()
        .filter(row => row.id === nodeInput.id);
      expect(settled).toHaveLength(1);
      expect(settled[0]?.executedIndex).toBe(4);
      expect(settled[0]?.nodeIndex).toBe(1);
      expect(settled[0]?.sessionIndex).toBe(4);
      expect(
        db.select().from(config.schema.sessionMetadata).get()?.nextSessionIndex,
      ).toBe(5);
      expect(
        db.select().from(config.schema.optimisticAppliedOperations).all(),
      ).toHaveLength(0);
    } finally {
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });

  it('shows service staged input, settlement, foreign occurrences, and stable remount history', async () => {
    const sqlite = await client();
    const config = makeResourceDbConfig({
      models: { item },
      otherTables: serviceSessionRepoTables,
    });
    const db = makeWaSqliteDrizzle(sqlite, config);
    Effect.runSync(provisionDb({ db, schema: config.schema }));
    Effect.runSync(
      initializeServiceNodeProjection({
        db,
        definition: serviceDefinition,
        sessionId: 'sesn_service',
        snapshot: {
          identity: {
            ...identity,
            serviceName: 'counters',
            serviceVersion: '1.0.0',
          },
          metadata: {
            serviceIndex: 0,
            executedIndex: 0,
            serviceHash: hash,
            changeIndex: 0,
          },
          resources: [resource(10)],
          unresolvedCommands: [],
        },
      }),
    );
    const session = makeServiceSession({
      definition: serviceDefinition,
      models: serviceDefinition.models,
    });
    session.store.setState({
      sessionId: 'sesn_service',
      claims: {},
      serviceName: 'counters',
      sessionName: 'reader',
      serviceSessionLockKey: 'fixture',
      db,
      schema: config.schema,
      models: serviceDefinition.models,
      isInitialized: true,
      serviceIndex: 0,
      executedIndex: 0,
      serviceHash: hash,
      serviceVersion: '1.0.0',
      sessionStatus: 'current',
    });
    zerospinDevtoolsStore.getState().addServiceSession({ session });
    const entry = zerospinDevtoolsStore
      .getState()
      .serviceSessionsById.get('sesn_service');
    if (entry === undefined) throw new Error('Fixture registration failed');
    const subscribe = sqlite.subscribeToTableChanges.bind(sqlite);
    const unsubscribeCalls: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(sqlite, 'subscribeToTableChanges').mockImplementation(listener => {
      const unsubscribe = vi.fn(subscribe(listener));
      unsubscribeCalls.push(unsubscribe);
      return unsubscribe;
    });
    let mounted = render(<ServiceCommandsRowsTable session={entry} />);
    const command = { ...input, serviceName: 'counters' };
    act(() =>
      Effect.runSync(
        stageServiceCommandTx({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          command,
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText('cmd_pending')).toBeTruthy());
    expect(
      screen.getByRole('columnheader', { name: 'sessionIndex' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('columnheader', { name: 'journalIndex' }),
    ).toBeNull();
    const localRowElement = screen.getByText('cmd_pending').closest('tr');
    expect(db.select().from(config.schema.commands).get()?.sessionIndex).toBe(
      1,
    );
    expect(db.select().from(config.schema.item).get()?.amount).toBe(13);
    act(() =>
      Effect.runSync(
        importServiceNodeCommands({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          commands: [
            {
              ...command,
              nodeId: 'node_fixture',
              nodeIndex: 1,
              admissionIndex: 9,
            },
          ],
          throughChangeIndex: 1,
        }),
      ),
    );
    const failure = {
      _tag: 'ZerospinError' as const,
      code: 'operation-row-not-found',
      message: 'Missing row',
      status: 400,
      extra: null,
    };
    act(() =>
      Effect.runSync(
        importServiceNodeCommands({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          commands: [
            {
              id: 'cmd_pending',
              commandName: 'add',
              delta: { upserted: [], deleted: [] },
              admission: {
                status: 'succeeded',
                startedAt: new Date(time),
                completedAt: new Date(time),
              },
              execution: {
                status: 'failed',
                startedAt: new Date(time),
                completedAt: new Date(time),
                failure,
              },
              executedIndex: 1,
              serviceIndex: 10,
              serviceHash: hash,
            },
          ],
          throughChangeIndex: 2,
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText('cmd_pending')).toBeTruthy());
    expect(db.select().from(config.schema.item).get()?.amount).toBe(10);
    expect(db.select().from(config.schema.commands).get()?.admissionIndex).toBe(
      9,
    );
    expect(db.select().from(config.schema.commands).get()?.sessionIndex).toBe(
      1,
    );
    expect(screen.getByText('cmd_pending').closest('tr')).toBe(localRowElement);
    const terminal = {
      id: 'cmd_elsewhere' as const,
      commandName: 'add',
      delta: { upserted: [resource(14)], deleted: [] },
      admission: null,
      execution: null,
      executedIndex: 2,
      serviceIndex: 11,
      serviceHash: hash,
    };
    act(() =>
      Effect.runSync(
        importServiceNodeCommands({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          commands: [
            terminal,
            { ...terminal, executedIndex: 3, serviceIndex: 12 },
          ],
          throughChangeIndex: 4,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByText('cmd_elsewhere')).toHaveLength(2),
    );
    const foreign = db
      .select()
      .from(config.schema.commands)
      .all()
      .find(row => row.id === 'cmd_elsewhere');
    expect(foreign?.payload).toBeNull();
    expect(foreign?.claims).toBeNull();
    expect(foreign?.staging).toBeNull();
    expect(
      db
        .select()
        .from(config.schema.commands)
        .all()
        .map(row => row.sessionIndex),
    ).toEqual([1, 2, 3]);
    expect(
      db.select().from(config.schema.serviceSessionMetadata).get()
        ?.nextSessionIndex,
    ).toBe(4);
    const serviceRowsBefore = db.select().from(config.schema.commands).all();
    const serviceMetadataBefore = db
      .select()
      .from(config.schema.serviceSessionMetadata)
      .get();
    const serviceResourceBefore = db.select().from(config.schema.item).get();
    const payloadColumn = screen
      .getAllByRole('columnheader')
      .findIndex(header => header.textContent === 'payload');
    expect(
      screen
        .getAllByText('cmd_elsewhere')[0]
        ?.closest('tr')
        ?.querySelectorAll('td')[payloadColumn]?.textContent,
    ).toBe('');
    act(() => {
      const result = Effect.runSync(
        importServiceNodeCommands({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          commands: [
            {
              ...terminal,
              id: 'cmd_rollback',
              executedIndex: 4,
              serviceIndex: 13,
            },
            { ...terminal, id: 'cmd_gap', executedIndex: 6, serviceIndex: 14 },
          ],
          throughChangeIndex: 6,
        }).pipe(Effect.result),
      );
      expect(result._tag).toBe('Failure');
    });
    expect(db.select().from(config.schema.commands).all()).toEqual(
      serviceRowsBefore,
    );
    expect(
      db.select().from(config.schema.serviceSessionMetadata).get(),
    ).toEqual(serviceMetadataBefore);
    expect(db.select().from(config.schema.item).get()).toEqual(
      serviceResourceBefore,
    );
    expect(screen.queryByText('cmd_rollback')).toBeNull();
    expect(
      db.select().from(config.schema.serviceSessionMetadata).get()?.changeIndex,
    ).toBe(4);
    expect(db.select().from(config.schema.item).get()?.amount).toBe(14);
    expect(db.select().from(config.schema.item).get()?.capturedAt).toEqual(
      new Date(1400),
    );
    expect(db.select().from(config.schema.item).get()?.details).toBe(
      '{"label":"14"}',
    );
    act(() =>
      Effect.runSync(
        importServiceNodeCommands({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          commands: [terminal],
          throughChangeIndex: 4,
        }),
      ),
    );
    expect(screen.getAllByText('cmd_elsewhere')).toHaveLength(2);
    const replyInput = { ...command, id: 'cmd_reply' as const };
    act(() =>
      Effect.runSync(
        stageServiceCommandTx({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          command: replyInput,
        }),
      ),
    );
    expect(db.select().from(config.schema.item).get()?.amount).toBe(17);
    act(() =>
      Effect.runSync(
        importServiceNodeCommands({
          db,
          definition: serviceDefinition,
          sessionId: 'sesn_service',
          commands: [
            {
              id: replyInput.id,
              commandName: 'add',
              delta: { upserted: [], deleted: [] },
              admission: {
                status: 'succeeded',
                startedAt: new Date(time),
                completedAt: new Date(time),
              },
              execution: {
                status: 'failed',
                startedAt: new Date(time),
                completedAt: new Date(time),
                failure,
              },
              executedIndex: 4,
              serviceIndex: 13,
              serviceHash: hash,
            },
            {
              ...replyInput,
              nodeId: 'node_fixture',
              nodeIndex: 2,
              admissionIndex: 12,
            },
          ],
          throughChangeIndex: 7,
        }),
      ),
    );
    expect(db.select().from(config.schema.item).get()?.amount).toBe(14);
    const replyRows = db
      .select()
      .from(config.schema.commands)
      .all()
      .filter(row => row.id === replyInput.id);
    expect(replyRows).toHaveLength(1);
    expect(replyRows[0]?.executedIndex).toBe(4);
    expect(replyRows[0]?.nodeIndex).toBe(2);
    expect(replyRows[0]?.sessionIndex).toBe(4);
    expect(
      db.select().from(config.schema.serviceSessionMetadata).get()
        ?.nextSessionIndex,
    ).toBe(5);
    expect(
      db.select().from(config.schema.optimisticAppliedOperations).all(),
    ).toHaveLength(0);
    mounted.unmount();
    expect(unsubscribeCalls[0]).toHaveBeenCalledTimes(1);
    mounted = render(<ServiceCommandsRowsTable session={entry} />);
    await waitFor(() =>
      expect(screen.getAllByText('cmd_elsewhere')).toHaveLength(2),
    );
    expect(screen.getByText('cmd_pending')).toBeTruthy();
    expect(
      db
        .select()
        .from(config.schema.commands)
        .all()
        .map(row => row.sessionIndex),
    ).toEqual([1, 2, 3, 4]);
    expect(
      screen.getByRole('columnheader', { name: 'sessionIndex' }),
    ).toBeTruthy();
    mounted.unmount();
    expect(unsubscribeCalls[1]).toHaveBeenCalledTimes(1);
  });
  it('retains multiple standalone local commands without allocating server execution positions', async () => {
    const sqlite = await client();
    const config = makeResourceDbConfig({
      models: { item },
      otherTables: sessionRepoDbConfig.tables,
    });
    const db = makeWaSqliteDrizzle(sqlite, config);
    Effect.runSync(provisionDb({ db, schema: config.schema }));
    Effect.runSync(
      initializeAggregateNodeProjection({
        db,
        definition: aggregateDefinition,
        sessionId: 'sesn_standalone',
        snapshot: {
          identity: {
            ...identity,
            aggregateName: 'counter',
            aggregateVersion: '1.0.0',
            aggregateId: 'acct_one',
          },
          metadata: {
            aggregateIndex: 0,
            executedIndex: 0,
            executedHash: hash,
            changeIndex: 0,
          },
          resources: [resource(10)],
          unresolvedCommands: [],
        },
      }),
    );
    const session = makeAggregateSession({ definition: aggregateDefinition });
    session.store.setState({
      sessionId: 'sesn_standalone',
      aggregateId: 'acct_one',
      aggregateName: 'counter',
      actorName: 'reader',
      actorVersion: '1.0.0',
      claims: {},
      sessionName: 'reader',
      aggregateSessionLockKey: 'fixture',
      db,
      schema: config.schema,
      models: aggregateDefinition.models,
      isInitialized: true,
      aggregateIndex: 0,
      executedIndex: 0,
      executedHash: hash,
      pushIndex: 0,
      sessionStatus: 'current',
    });
    let nextId = 0;
    const runtime = ManagedRuntime.make(
      Layer.merge(
        Layer.succeed(CuidFactory, () =>
          Effect.sync(() => `fixture${++nextId}`),
        ),
        Layer.succeed(MonotonicFactory, () =>
          Effect.sync(() => `fixture${++nextId}`),
        ),
      ),
    );
    bindAggregateSession({
      session,
      runtime,
      state: getInitializedStateOrThrow({ session }),
      commitCommand: executeLocalSessionCommandTx,
    });
    try {
      expect(
        stageCommand({ session, contractName: 'add', payload: { amount: 2 } })
          ._tag,
      ).toBe('Success');
      expect(
        stageCommand({ session, contractName: 'add', payload: { amount: 3 } })
          ._tag,
      ).toBe('Success');
      const rows = db.select().from(config.schema.commands).all();
      expect(rows).toHaveLength(2);
      expect(rows.map(row => row.sessionIndex)).toEqual([1, 2]);
      expect(rows.map(row => row.executedIndex)).toEqual([0, 0]);
      expect(
        db.select().from(config.schema.optimisticAppliedOperations).all(),
      ).toHaveLength(0);
      expect(db.select().from(config.schema.item).get()?.amount).toBe(15);
    } finally {
      releaseAggregateSession(session);
      await runtime.dispose();
    }
  });
});
