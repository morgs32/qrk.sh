import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import SQLiteFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
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
import type { IServiceNodeCommandInput } from '@zerospin/core/ServiceNode/types';
import { stageServiceCommandTx } from '@zerospin/core/serviceSession/importServiceNodeCommands';
import { initializeServiceNodeProjection } from '@zerospin/core/serviceSession/initializeServiceNodeProjection';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import {
  bindServiceSessionExecution,
  stageServiceCommand,
} from '@zerospin/core/serviceSession/stageServiceCommand';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import { ContractError, makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import { Effect, Schema, SchemaGetter } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const time = '2026-10-05T12:00:00.000Z';
const hash = 'a'.repeat(64);
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { amount: primitives.integer() },
    indexes: [],
  },
);
const add = makeContractVersion(defineContract('add'), {
  version: '1.0.0',
  payload: { amount: primitives.integer() },
  models: { item },
  program: ({ db, models, payload }) =>
    Effect.gen(function* () {
      const previous = db.query.item.findFirst().sync();
      if (previous === undefined) throw new Error('Missing fixture resource');
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: previous.amount + payload.amount },
      });
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
const rejected = makeContractVersion(defineContract('rejected'), {
  version: '1.0.0',
  payload: {},
  failures: { dateRejected: DateRejected },
});
const definition = {
  kind: 'service',
  systemName: 'service-staging-fixture',
  serviceName: 'counters',
  serviceVersion: '1.0.0',
  actorName: 'reader',
  actorVersion: '1.0.0',
  claimsSchema: Schema.Struct({}),
  sessionName: 'reader',
  contracts: { add, rejected },
  models: { item },
  modelNames: ['item'],
} satisfies IServiceSessionDefinition;

const clients: Awaited<ReturnType<typeof makeInMemorySQLite3>>[] = [];
const unbinders: (() => void)[] = [];
beforeEach(() => {
  failureEncodes = 0;
  failureDecodes = 0;
});
afterEach(() => {
  for (const unbind of unbinders.splice(0)) unbind();
  for (const client of clients.splice(0)) client.sqlite3.close(client.db);
});

async function fixture() {
  const wasmBinary = readFileSync(
    createRequire(import.meta.url).resolve(
      '@livestore/wa-sqlite/dist/wa-sqlite.wasm',
    ),
  );
  const sqlite = await makeInMemorySQLite3(() => SQLiteFactory({ wasmBinary }));
  clients.push(sqlite);
  const config = makeResourceDbConfig({
    models: { item },
    otherTables: serviceSessionRepoTables,
  });
  const db = makeWaSqliteDrizzle(sqlite, config);
  Effect.runSync(provisionDb({ db, schema: config.schema }));
  const sessionId = 'sesn_service';
  Effect.runSync(
    initializeServiceNodeProjection({
      db,
      definition,
      sessionId,
      snapshot: {
        identity: {
          apiUrl: 'https://fixture.invalid',
          publishableKey: 'fixture',
          systemName: definition.systemName,
          serviceName: definition.serviceName,
          serviceVersion: definition.serviceVersion,
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: {},
          definitionHash: hash,
        },
        metadata: {
          serviceIndex: 0,
          executedIndex: 0,
          serviceHash: hash,
          changeIndex: 0,
        },
        resources: [
          {
            id: 'itm_one',
            modelName: 'item',
            version: '1.0.0',
            createdAt: new Date(time),
            updatedAt: new Date(time),
            amount: 10,
          },
        ],
        unresolvedCommands: [],
      },
    }),
  );
  const session = makeServiceSession({ definition, models: definition.models });
  session.store.setState({
    sessionId,
    claims: {},
    serviceName: definition.serviceName,
    sessionName: definition.sessionName,
    serviceSessionLockKey: 'fixture',
    db,
    schema: config.schema,
    models: definition.models,
    isInitialized: true,
    serviceIndex: 0,
    executedIndex: 0,
    serviceHash: hash,
    serviceVersion: definition.serviceVersion,
    sessionStatus: 'current',
  });
  let nextId = 0;
  type Execution = Parameters<typeof bindServiceSessionExecution>[1];
  const stage = vi.fn<Execution['stage']>(props => {
    const command: IServiceNodeCommandInput = {
      id: `cmd_fixture${++nextId}`,
      commandName: props.contractName,
      contractVersion: '1.0.0',
      payload: JSON.stringify(props.payload),
      serviceName: definition.serviceName,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      sessionName: definition.sessionName,
      claims: {},
      staging: {
        result: null,
        startedAt: time,
        completedAt: time,
        stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
      },
    };
    return Effect.runSync(
      stageServiceCommandTx({ db, definition, sessionId, command }).pipe(
        Effect.as(command),
        Effect.result,
      ),
    );
  });
  const accept = vi.fn<Execution['accept']>(async () => ({
    _tag: 'Success',
    success: undefined,
  }));
  const unbind = bindServiceSessionExecution(session, {
    stage,
    accept,
    can: () => ({ _tag: 'Success', success: undefined }),
  });
  unbinders.push(unbind);
  return { session, sqlite, db, config, stage, accept, unbind };
}

describe('service staging notifications', () => {
  it('notifies with the exact returned failure before initialization and after unbinding, and unsubscribes', async () => {
    const session = makeServiceSession({
      definition,
      models: definition.models,
    });
    const observer = vi.fn<Parameters<typeof session.onStageFailure>[0]>();
    const unsubscribe = session.onStageFailure(observer);
    const notReady = await stageServiceCommand({
      session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(notReady._tag).toBe('Failure');
    if (notReady._tag !== 'Failure') {
      throw new Error('Expected unbound session failure');
    }
    expect(notReady.failure.code).toBe('service-session-not-ready');
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]?.[0].failure).toBe(notReady.failure);
    unsubscribe();
    await stageServiceCommand({
      session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(observer).toHaveBeenCalledTimes(1);

    const f = await fixture();
    const releasedObserver =
      vi.fn<Parameters<typeof f.session.onStageFailure>[0]>();
    f.session.onStageFailure(releasedObserver);
    f.unbind();
    const released = await stageServiceCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(released._tag).toBe('Failure');
    if (released._tag !== 'Failure') {
      throw new Error('Expected released session failure');
    }
    expect(releasedObserver.mock.calls[0]?.[0].failure).toBe(released.failure);
    expect(f.accept).not.toHaveBeenCalled();
  });

  it('recognizes a declared failure once while isolating throwing observers', async () => {
    const f = await fixture();
    const failure = DateRejected.make({ extra: { at: new Date(time) } });
    f.stage.mockReturnValueOnce({ _tag: 'Failure', failure });
    const diagnostic = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const observerError = new Error('Observer failed');
    f.session.onStageFailure(() => {
      throw observerError;
    });
    const observer = vi.fn<Parameters<typeof f.session.onStageFailure>[0]>();
    f.session.onStageFailure(observer);
    const result = await stageServiceCommand({
      session: f.session,
      contractName: 'rejected',
      payload: {},
    });
    expect(result._tag).toBe('Failure');
    if (result._tag !== 'Failure') throw new Error('Expected declared failure');
    expect(result.failure.extra).toEqual({ at: new Date(time) });
    expect(failureEncodes).toBe(1);
    expect(failureDecodes).toBe(1);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]?.[0].failure).toBe(result.failure);
    expect(diagnostic).toHaveBeenCalledWith(
      'Service session failure observer threw',
      observerError,
    );
    expect(f.accept).not.toHaveBeenCalled();
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(0);
    expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(10);
  });

  it('notifies after SQLite rollback and permits a successful retry', async () => {
    const f = await fixture();
    const metadata = f.db
      .select()
      .from(f.config.schema.serviceSessionMetadata)
      .get();
    const inspect = makeTx('ServiceStaging.inspectAfterRollback')(function* (
      tx: ITx<typeof f.config>,
    ) {
      yield* Effect.void;
      return {
        amount: tx.select().from(f.config.schema.item).get()?.amount,
        commands: tx.select().from(f.config.schema.commands).all().length,
        inverses: tx
          .select()
          .from(f.config.schema.optimisticAppliedOperations)
          .all().length,
        metadata: tx
          .select()
          .from(f.config.schema.serviceSessionMetadata)
          .get(),
      };
    });
    const observer = vi.fn<Parameters<typeof f.session.onStageFailure>[0]>(
      () => {
        expect(Effect.runSync(inspect(f.db))).toEqual({
          amount: 10,
          commands: 0,
          inverses: 0,
          metadata,
        });
      },
    );
    f.session.onStageFailure(observer);
    f.db.run(
      sql.raw(
        "CREATE TRIGGER fixture_reject_command AFTER INSERT ON commands BEGIN SELECT RAISE(ABORT, 'fixture-command-commit-blocked'); END",
      ),
    );
    const result = await stageServiceCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(result._tag).toBe('Failure');
    if (result._tag !== 'Failure') {
      throw new Error('Expected rejected transaction');
    }
    expect(result.failure.code).toBe('drizzle-transaction-failed');
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.results[0]?.type).toBe('return');
    expect(observer.mock.calls[0]?.[0].failure).toBe(result.failure);
    expect(f.accept).not.toHaveBeenCalled();
    f.db.run(sql.raw('DROP TRIGGER fixture_reject_command'));
    const retry = await stageServiceCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(retry._tag).toBe('Success');
    expect(observer).toHaveBeenCalledTimes(1);
    expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(13);
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(1);
    expect(f.accept).toHaveBeenCalledTimes(1);
  });

  it('notifies an unexpected local exception and rejects with the original error', async () => {
    const f = await fixture();
    const original = new Error('Unexpected local staging exception');
    f.stage.mockImplementationOnce(() => {
      throw original;
    });
    const observer = vi.fn<Parameters<typeof f.session.onStageFailure>[0]>();
    f.session.onStageFailure(observer);
    await expect(
      stageServiceCommand({
        session: f.session,
        contractName: 'add',
        payload: { amount: 3 },
      }),
    ).rejects.toBe(original);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]?.[0]).toMatchObject({
      contractName: 'add',
      failure: { code: 'service-command-staging-exception' },
    });
    expect(f.accept).not.toHaveBeenCalled();
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(0);
  });

  it('hands off committed state and waits for Node acceptance without a staging failure notification', async () => {
    const f = await fixture();
    const observer = vi.fn();
    f.session.onStageFailure(observer);
    let finishAcceptance: (() => void) | undefined;
    f.accept.mockImplementationOnce(command => {
      expect(f.db.select().from(f.config.schema.commands).get()?.id).toBe(
        command.id,
      );
      expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(13);
      return new Promise(resolve => {
        finishAcceptance = () =>
          resolve({ _tag: 'Success', success: undefined });
      });
    });
    let completed = false;
    const pending = stageServiceCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    }).then(result => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    if (finishAcceptance === undefined) {
      throw new Error('Expected acceptance handoff');
    }
    finishAcceptance();
    expect((await pending)._tag).toBe('Success');
    expect(observer).not.toHaveBeenCalled();
    expect(f.accept.mock.results[0]?.type).toBe('return');
  });

  it('preserves a committed command and returns uncertain acceptance failure without a staging notification', async () => {
    const f = await fixture();
    const observer = vi.fn();
    f.session.onStageFailure(observer);
    const failure = makeZerospinError('service-command-handoff-failed');
    f.accept.mockResolvedValueOnce({ _tag: 'Failure', failure });
    const result = await stageServiceCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(result).toEqual({ _tag: 'Failure', failure });
    expect(observer).not.toHaveBeenCalled();
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(1);
    expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(13);
    const original = new Error('Unexpected acceptance exception');
    f.accept.mockRejectedValueOnce(original);
    await expect(
      stageServiceCommand({
        session: f.session,
        contractName: 'add',
        payload: { amount: 2 },
      }),
    ).rejects.toBe(original);
    expect(observer).not.toHaveBeenCalled();
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(2);
    expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(15);
  });

  it('does not report a staging failure when result decoding fails after durable acceptance', async () => {
    const f = await fixture();
    const observer = vi.fn();
    f.session.onStageFailure(observer);
    const stage = f.stage.getMockImplementation();
    if (stage === undefined) {
      throw new Error('Expected fixture staging implementation');
    }
    f.stage.mockImplementationOnce(props => {
      const result = stage(props);
      return result._tag === 'Failure'
        ? result
        : {
            _tag: 'Success',
            success: {
              ...result.success,
              staging: {
                ...result.success.staging,
                result: 'invalid result for a void contract',
              },
            },
          };
    });
    const result = await stageServiceCommand({
      session: f.session,
      contractName: 'add',
      payload: { amount: 3 },
    });
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'contract-result-decode-failed' },
    });
    expect(f.accept).toHaveBeenCalledTimes(1);
    expect(observer).not.toHaveBeenCalled();
    expect(f.db.select().from(f.config.schema.commands).all()).toHaveLength(1);
    expect(f.db.select().from(f.config.schema.item).get()?.amount).toBe(13);
  });
});
