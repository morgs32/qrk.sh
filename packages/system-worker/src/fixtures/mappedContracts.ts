import assert from 'node:assert/strict';

import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  assertActorExternalContracts,
  publicContracts,
} from '@zerospin/core/contracts/externalContract';
import { validateExternalResponse } from '@zerospin/core/contracts/externalResponseCodec';
import { encodeFailure } from '@zerospin/core/contracts/failureCodec';
import {
  Contract,
  makeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
import { makeExternalContract } from '@zerospin/core/contracts/make/makeExternalContract';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { mapContractVersion } from '@zerospin/core/contracts/make/mapContractVersion';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import { resolveContractResult } from '@zerospin/core/contracts/resultCodec';
import type {
  IAnyContracts,
  IContract,
  IContractOutput,
  InferContractResult,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeServiceVersion } from '@zerospin/core/service/make/makeServiceVersion';
import { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { Effect, ManagedRuntime, Result, Schema } from 'effect';
import { assert as assertType, type Equals } from 'tsafe';

import { genesisDispositionHash } from '../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionChainDbConfig } from '../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import { receiveExecutedCommands as receiveAggregateExecutedCommands } from '../AggregateVersionChain/receiveExecutedCommands/receiveExecutedCommands.js';
import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { executeCommandsTx as executeAggregate } from '../AggregateVersionRepo/executeCommands/executeCommandsTx.js';
import { asyncOperationLifecycleCodec } from '../asyncOperations/asyncOperationsDbConfig.js';
import {
  makeAsyncOperations,
  recordResponse,
} from '../asyncOperations/makeAsyncOperations.js';
import {
  readAggregateVersionChainOutput,
  readAggregateVersionRepoOutput,
  readServiceVersionChainOutput,
} from '../asyncOperations/readOperationOutput.js';
import {
  readPreparedAggregateAsyncWork,
  readPreparedAsyncWork,
  resolveWorkContract,
} from '../asyncOperations/readPreparedAsyncCommand.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { encodeOwnedOperation } from '../ownedOperations.js';
import { receiveExecutedCommands as receiveServiceExecutedCommands } from '../ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.js';
import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { executeCommandsTx as executeService } from '../ServiceVersionRepo/executeCommands/executeCommandsTx.js';
import { readExecutedCommandsPage } from '../ServiceVersionRepo/readExecutedCommandsPage.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';

import {
  verifyMappedProjection,
  verifyMappedServiceProjection,
} from './mappedProjection.js';
import { runFixture } from './runFixture.js';

export const verifyMappedContracts = Effect.fn('verifyMappedContracts')(
  function* () {
    const item = makeModelVersion(
      defineModel({ name: 'item', abbreviation: 'itm' }),
      {
        version: '1.0.0',
        attributes: { name: primitives.text() },
        indexes: [],
      },
    );
    const models = { item };
    const ownerModels: IAnyModels = models;
    const order: string[] = [];
    let producers = 0;
    const asyncObserve = makeExternalContract({
      name: 'asyncObserve',
      version: '1.0.0',
      payload: {
        value: primitives.text(),
        at: primitives.json({ schema: Schema.DateFromString }),
      },
      external: {
        response: Schema.Null,
        request: ({ payload }) =>
          Effect.sync(() => {
            assert.ok(payload.at instanceof Date);
            producers++;
            return null;
          }),
      },
      failures: { rejected: ContractError.schema({ code: 'rejected' }) },
      program: ({ failures }) => failures.rejected.make(),
    });
    const asyncSendReceipt = makeExternalContract({
      name: 'asyncSendReceipt',
      version: '1.0.0',
      payload: { value: primitives.text() },
      external: {
        response: Schema.Null,
        request: () =>
          Effect.sync(() => {
            producers++;
            return null;
          }),
      },
      program: () => Effect.void,
    });
    const base = makeContractVersion(defineContract('write'), {
      version: '1.0.0',
      payload: { reject: primitives.boolean() },
      models,
      failures: { rejected: ContractError.schema({ code: 'rejected' }) },
      result: Schema.String,
      program: ({ models }) =>
        Effect.gen(function* () {
          order.push('base');
          yield* models.item.create({
            resourceId: 'itm_one',
            attributes: { name: 'base' },
          });
          return 'base';
        }),
    });
    const mapped = mapContractVersion({
      contractVersion: base,
      operations: { models, contracts: { asyncObserve } },
      result: Schema.Struct({ authoritative: Schema.String }),
      program: ({ command, db, failures, operations }) =>
        Effect.gen(function* () {
          order.push('mapper');
          assert.equal(command.result, 'base');
          assert.equal(command.operations.length, 1);
          assert.ok(Object.isFrozen(command));
          assert.equal('execution' in command, false);
          assert.equal('admission' in command, false);
          assert.deepEqual(Object.keys(db.query), ['item']);
          assert.equal(
            db.query.item.findFirst().sync(),
            undefined,
            'both programs see pre-application state',
          );
          if (command.payload.reject) return yield* failures.rejected.make();
          yield* operations.contracts.asyncObserve({
            value: 'one',
            at: new Date(0),
          });
          yield* operations.models.item.update({
            resourceId: 'itm_one',
            attributes: { name: 'mapped' },
          });
          yield* operations.contracts.asyncObserve({
            value: 'two',
            at: new Date(0),
          });
          return { authoritative: 'mapped' };
        }),
    });
    assertType<
      Equals<
        InferContractResult<typeof mapped>,
        { readonly authoritative: string }
      >
    >();
    const identity = makeActorIdentity({
      claims: Schema.Struct({ aggregateId: Schema.String }),
      actorPath: RoutePattern.parse('/'),
    });
    const actorDb = makeActorDbVersion({ models: ownerModels });
    const makeOwner = (
      version: string,
      contract: IContract,
      extras: IAnyContracts = {},
    ) => {
      const contracts = { write: contract, asyncObserve, ...extras };
      const actor = makeAggregateActorVersion(
        { name: 'operator' },
        {
          version,
          authentication: 'none',
          identity,
          db: actorDb,
          selections: {},
          contracts,
        },
      );
      return makeAggregateVersion(
        { name: 'fixture' },
        { version, models, contracts, actors: { operator: actor } },
      );
    };
    const aggregate = makeOwner('1.0.0', mapped);
    assert.throws(() => assertActorExternalContracts({ write: mapped }));
    assert.throws(() =>
      assertActorExternalContracts({
        write: mapped,
        asyncObserve: { ...asyncObserve },
      }),
    );
    assert.throws(() =>
      Reflect.apply(mapContractVersion, undefined, [
        {
          contractVersion: base,
          operations: { models, contracts: { ordinary: base } },
          result: Schema.String,
          program: () => Effect.succeed('invalid'),
        },
      ]),
    );
    const db = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: ownerModels,
        otherTables: aggregateVersionRepoDbConfig.tables,
      }),
    });
    const key = {
      systemId: 'sys_fixture',
      aggregateId: 'agg_one',
      aggregateName: 'fixture',
      aggregateVersion: '1.0.0',
    };
    const command = {
      id: 'cmd_mapped' as const,
      commandName: 'write',
      contractVersion: base.version,
      payload: { reject: false },
    };
    const output = yield* Effect.gen(function* () {
      const input = yield* prepareContractInput({
        contract: mapped,
        command,
        claims: { aggregateId: 'agg_one' },
      });
      const made = yield* makeOperations({
        contract: mapped,
        db,
        models,
        command,
        input,
      });
      return { ...made, input };
    });
    assert.deepEqual(order, ['base', 'mapper']);
    assert.deepEqual(
      output.operations.map(operation => operation.operationName),
      ['create', 'async', 'update', 'async'],
    );
    assert.deepEqual(output.encodedResult, { authoritative: 'mapped' });
    assert.deepEqual(
      yield* resolveContractResult(mapped, {
        ...command,
        result: output.encodedResult,
      }),
      { authoritative: 'mapped' },
    );
    assert.ok(
      Result.isFailure(
        yield* resolveContractResult(base, {
          ...command,
          result: output.encodedResult,
        }).pipe(Effect.result),
      ),
    );
    assert.ok(
      Result.isFailure(
        yield* Effect.gen(function* () {
          const input = yield* prepareContractInput({
            contract: mapped,
            command: { ...command, payload: { reject: true } },
            claims: { aggregateId: 'agg_one' },
          });
          const made = yield* makeOperations({
            contract: mapped,
            db,
            models,
            command: { ...command },
            input,
          });
          return { ...made, input };
        }).pipe(Effect.result),
      ),
    );
    assert.equal(
      db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.asyncOperations)
        .all().length,
      0,
    );
    const invalidMapped = mapContractVersion({
      contractVersion: base,
      operations: { models: {}, contracts: {} },
      result: Schema.String,
      program: () => Effect.succeed('bad'),
    });
    assert.ok(
      Result.isFailure(
        yield* Effect.gen(function* () {
          const input = yield* prepareContractInput({
            contract: { ...invalidMapped, result: Schema.Number },
            command,
            claims: { aggregateId: 'agg_one' },
          });
          const made = yield* makeOperations({
            contract: { ...invalidMapped, result: Schema.Number },
            db,
            models,
            command,
            input,
          });
          return { ...made, input };
        }).pipe(Effect.result),
      ),
    );
    const suspended = mapContractVersion({
      contractVersion: base,
      operations: { models: {}, contracts: {} },
      result: Schema.String,
      program: () => Effect.promise(async () => 'bad'),
    });
    const suspendedResult = yield* Effect.gen(function* () {
      const input = yield* prepareContractInput({
        contract: suspended,
        command,
        claims: { aggregateId: 'agg_one' },
      });
      const made = yield* makeOperations({
        contract: suspended,
        db,
        models,
        command,
        input,
      });
      return { ...made, input };
    }).pipe(Effect.result);
    assert.ok(Result.isFailure(suspendedResult));
    assert.equal(suspendedResult.failure.code, 'program-must-be-synchronous');
    let mappedCalls = 0;
    const invalidBase = mapContractVersion({
      contractVersion: Object.assign(new Contract(), base, {
        result: Schema.Number,
      }),
      operations: { models: {}, contracts: {} },
      result: Schema.String,
      program: () =>
        Effect.sync(() => {
          mappedCalls++;
          return 'unexpected';
        }),
    });
    assert.ok(
      Result.isFailure(
        yield* Effect.gen(function* () {
          const input = yield* prepareContractInput({
            contract: invalidBase,
            command,
            claims: { aggregateId: 'agg_one' },
          });
          const made = yield* makeOperations({
            contract: invalidBase,
            db,
            models,
            command,
            input,
          });
          return { ...made, input };
        }).pipe(Effect.result),
      ),
    );
    assert.equal(mappedCalls, 0);
    const sessionDefinition = {
      kind: 'aggregate' as const,
      systemName: 'fixture',
      ...key,
      actorName: 'operator',
      actorVersion: '1.0.0',
      sessionName: 'session',
      claimsSchema: identity.claimsSchema,
      models,
      modelNames: ['item'],
      contracts: publicContracts({ write: mapped, asyncObserve }),
    };
    assert.equal(sessionDefinition.contracts.write, base);
    assert.deepEqual(
      makeAggregateSessionLock(sessionDefinition).contracts.write
        ?.resultJsonSchema,
      base.spec.resultJsonSchema,
    );
    const stagingDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models,
        otherTables: sessionRepoDbConfig.tables,
      }),
    });
    const stagingCommand = {
      ...command,
      ...key,
      actorName: 'operator',
      actorVersion: '1.0.0',
      sessionName: 'session',
      sessionId: 'sesn_one' as const,
      claims: { aggregateId: 'agg_one' },
      pushIndex: null,
    };
    const staged = yield* stageSessionCommandTx(stagingDb, {
      contract: base,
      sessionId: stagingCommand.sessionId,
      command: stagingCommand,
      madeOperations: yield* Effect.gen(function* () {
        const input = yield* prepareContractInput({
          contract: base,
          command,
          claims: { aggregateId: 'agg_one' },
        });
        const made = yield* makeOperations({
          contract: base,
          db: stagingDb,
          models,
          command,
          input,
        });
        return { ...made, input };
      }),
      startedAt: new Date(0),
      state: {
        aggregateIndex: 0,
        executedIndex: 0,
        executedHash: '0'.repeat(64),
        pushIndex: 0,
      },
    });
    assert.equal(staged.command.staging.result, 'base');
    assert.equal(producers, 0);
    const admission = {
      status: 'succeeded' as const,
      startedAt: new Date(0),
      completedAt: new Date(0),
    };
    const input = {
      ...command,
      payload: '{"reject":false}',
      ...key,
      systemName: 'fixture',
      actorName: 'operator',
      actorVersion: '1.0.0',
      claims: { aggregateId: 'agg_one' },
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
      response: null,
      aggregateIndex: 1,
      admission,
      execution: { status: 'pending' as const },
      dispositionHash: null,
    };
    const preparedOperations = (
      outputs: readonly IContractOutput[],
      commandId: string = command.id,
    ) =>
      Effect.forEach(outputs, (operation, operationIndex) =>
        Effect.gen(function* () {
          if (operation.operationName === 'async') {
            return { ...operation, commandId, operationIndex };
          }
          return yield* encodeOwnedOperation({
            output: operation,
            commandId,
            operationIndex,
          });
        }),
      );
    const head = {
      singletonId: 1,
      aggregateIndex: 0,
      executedIndex: 0,
      dispositionHash: genesisDispositionHash(),
    };
    db.insert(aggregateVersionRepoDbConfig.schema.head).values(head).run();
    yield* executeAggregate(db, {
      head,
      key,
      aggregate,
      preparedPage: [
        {
          command: input,
          startedAt: new Date(0),
          originalExecutionVersion: key.aggregateVersion,
          operations: yield* preparedOperations(output.operations),
          encodedResult: output.encodedResult,
          contractVersion: mapped.version,
          failure: null,
          contract: mapped,
          payload: command.payload,
          guard: () => Effect.void,
        },
      ],
    });
    const originalRows = db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.asyncOperations)
      .all();
    assert.equal(originalRows.length, 2);
    assert.notEqual(
      originalRows[0]?.asyncCommandId,
      originalRows[1]?.asyncCommandId,
    );
    assert.deepEqual(
      originalRows.map(row => row.operationIndex),
      [1, 3],
    );
    const retained = readAggregateVersionRepoOutput(db, command.id);
    assert.deepEqual(
      retained.map(row => row.operationIndex),
      [0, 1, 2, 3],
    );
    assert.equal(
      Reflect.get(db.select().from(item.drizzleSchema).get()!, 'name'),
      'mapped',
    );
    const terminal = db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.executedCommandOutbox)
      .get()!;
    const delivery = {
      kind: 'command' as const,
      command: terminal,
      executedIndex: 1,
      operations: retained,
    };
    const rejectedOutput = yield* Effect.gen(function* () {
      const input = yield* prepareContractInput({
        contract: mapped,
        command: { ...command, payload: { reject: true } },
        claims: { aggregateId: 'agg_one' },
      });
      const made = yield* makeOperations({
        contract: mapped,
        db: yield* makeProvisionedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({ models: ownerModels }),
        }),
        models,
        command: { ...command },
        input,
      });
      return { ...made, input };
    }).pipe(Effect.result);
    assert.ok(Result.isFailure(rejectedOutput));
    const rejectedFailure = yield* encodeFailure(
      mapped,
      rejectedOutput.failure,
    );
    const failingOperations: readonly IContractOutput[] = [
      output.operations[1]!,
      {
        model: item,
        modelVersion: item.version,
        operationName: 'delete',
        resourceId: 'itm_missing',
        body: {},
      },
    ];
    yield* executeAggregate(db, {
      head: db.select().from(aggregateVersionRepoDbConfig.schema.head).get(),
      key,
      aggregate,
      preparedPage: [
        {
          command: { ...input, id: 'cmd_apply_failure', aggregateIndex: 2 },
          startedAt: new Date(0),
          originalExecutionVersion: key.aggregateVersion,
          operations: yield* preparedOperations(
            failingOperations,
            'cmd_apply_failure',
          ),
          encodedResult: output.encodedResult,
          contractVersion: mapped.version,
          failure: null,
          contract: mapped,
          payload: command.payload,
          guard: () => Effect.void,
        },
        {
          command: { ...input, id: 'cmd_mapper_failure', aggregateIndex: 3 },
          startedAt: new Date(0),
          originalExecutionVersion: key.aggregateVersion,
          operations: [],
          encodedResult: null,
          contractVersion: mapped.version,
          failure: rejectedFailure,
          contract: mapped,
          payload: command.payload,
          guard: () => Effect.void,
        },
      ],
    });
    assert.equal(
      db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.asyncOperations)
        .all().length,
      2,
      'failed application and mapper rejection retain no eligible emissions',
    );
    assert.deepEqual(
      db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.executedCommandOutbox)
        .all()
        .map(row => JSON.parse(row.execution).status),
      ['succeeded', 'failed', 'failed'],
    );
    const chainDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateVersionChainDbConfig,
    });
    yield* receiveAggregateExecutedCommands({
      db: chainDb,
      key,
      rows: [delivery],
    });
    yield* receiveAggregateExecutedCommands({
      db: chainDb,
      key,
      rows: [delivery],
    });
    assert.deepEqual(
      readAggregateVersionChainOutput(chainDb, command.id),
      retained,
    );
    assert.ok(
      Result.isFailure(
        yield* receiveAggregateExecutedCommands({
          db: chainDb,
          key,
          rows: [{ ...delivery, operations: [...retained, retained[1]!] }],
        }).pipe(Effect.result),
      ),
    );
    yield* verifyMappedProjection({
      aggregate,
      delivery: {
        ...delivery,
        command: chainDb
          .select()
          .from(aggregateVersionChainDbConfig.schema.aggregateCommands)
          .get()!,
      },
    });
    const updated = mapContractVersion({
      contractVersion: base,
      operations: { models, contracts: { asyncObserve, asyncSendReceipt } },
      result: mapped.result,
      program: ({ operations }) =>
        Effect.gen(function* () {
          yield* operations.contracts.asyncSendReceipt({ value: 'new' });
          yield* operations.contracts.asyncObserve({
            value: 'changed',
            at: new Date(5),
          });
          yield* operations.models.item.update({
            resourceId: 'itm_one',
            attributes: { name: 'replay' },
          });
          return { authoritative: 'replay' };
        }),
    });
    const replayAggregate = makeOwner('2.0.0', updated, { asyncSendReceipt });
    const replayDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: ownerModels,
        otherTables: aggregateVersionRepoDbConfig.tables,
      }),
    });
    replayDb
      .insert(aggregateVersionRepoDbConfig.schema.head)
      .values(head)
      .run();
    const replayOutput = yield* Effect.gen(function* () {
      const input = yield* prepareContractInput({
        contract: updated,
        command,
        claims: { aggregateId: 'agg_one' },
      });
      const made = yield* makeOperations({
        contract: updated,
        db: replayDb,
        models,
        command,
        input,
      });
      return { ...made, input };
    });
    yield* executeAggregate(replayDb, {
      head,
      key: { ...key, aggregateVersion: '2.0.0' },
      aggregate: replayAggregate,
      preparedPage: [
        {
          command: input,
          startedAt: new Date(0),
          originalExecutionVersion: '1.0.0',
          operations: yield* preparedOperations(replayOutput.operations),
          encodedResult: replayOutput.encodedResult,
          contractVersion: updated.version,
          failure: null,
          contract: updated,
          payload: command.payload,
          guard: () => Effect.void,
        },
      ],
    });
    const replayRows = replayDb
      .select()
      .from(aggregateVersionRepoDbConfig.schema.asyncOperations)
      .all();
    assert.deepEqual(
      replayRows.map(row => row.asyncContractName),
      ['asyncSendReceipt', 'asyncObserve'],
    );
    assert.ok(
      replayRows.every(
        row =>
          row.asyncCommandId === null &&
          row.nextRunAt === null &&
          row.actorName === null,
      ),
    );
    let armed = 0;
    const producerRuntime = ManagedRuntime.make(AsyncLive);
    const runner = makeAsyncOperations({
      db: replayDb,
      alarms: makeAlarmRegistry({
        storage: {
          setAlarm: async () => {
            armed++;
          },
          deleteAlarm: async () => undefined,
        },
      }),
      resolve: () => Effect.succeed(asyncObserve),
      run: program => runFixture(producerRuntime, program),
      background: () => undefined,
      deliver: () => Effect.void,
    });
    yield* runner.recover();
    assert.equal(armed, 0);
    assert.equal(producers, 0);
    assert.equal(
      Reflect.get(replayDb.select().from(item.drizzleSchema).get()!, 'name'),
      'replay',
    );
    assert.equal(
      replayDb
        .select()
        .from(aggregateVersionRepoDbConfig.schema.asyncCommandOutbox)
        .all().length,
      0,
    );
    const freshDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: ownerModels,
        otherTables: aggregateVersionRepoDbConfig.tables,
      }),
    });
    freshDb.insert(aggregateVersionRepoDbConfig.schema.head).values(head).run();
    const freshCommand = { ...command, id: 'cmd_fresh' as const };
    const freshOutput = yield* Effect.gen(function* () {
      const input = yield* prepareContractInput({
        contract: updated,
        command: freshCommand,
        claims: { aggregateId: 'agg_one' },
      });
      const made = yield* makeOperations({
        contract: updated,
        db: freshDb,
        models,
        command: freshCommand,
        input,
      });
      return { ...made, input };
    });
    yield* executeAggregate(freshDb, {
      head,
      key: { ...key, aggregateVersion: '2.0.0' },
      aggregate: replayAggregate,
      preparedPage: [
        {
          command: {
            ...input,
            id: freshCommand.id,
            aggregateVersion: '2.0.0',
            actorVersion: '2.0.0',
          },
          startedAt: new Date(0),
          originalExecutionVersion: '2.0.0',
          operations: yield* preparedOperations(
            freshOutput.operations,
            freshCommand.id,
          ),
          encodedResult: freshOutput.encodedResult,
          contractVersion: updated.version,
          failure: null,
          contract: updated,
          payload: command.payload,
          guard: () => Effect.void,
        },
      ],
    });
    const freshRunner = makeAsyncOperations({
      db: freshDb,
      alarms: makeAlarmRegistry({
        storage: {
          setAlarm: async () => undefined,
          deleteAlarm: async () => undefined,
        },
      }),
      resolve: work => resolveWorkContract(replayAggregate, work),
      run: program => runFixture(producerRuntime, program),
      background: () => undefined,
      deliver: () => Effect.void,
    });
    yield* freshRunner.recover();
    yield* Effect.promise(() => freshRunner.settle());
    assert.equal(
      producers,
      2,
      'fresh original execution runs the newly registered producer',
    );
    assert.equal(
      freshDb
        .select()
        .from(aggregateVersionRepoDbConfig.schema.asyncCommandOutbox)
        .all().length,
      2,
    );
    assert.ok(
      freshDb
        .select()
        .from(aggregateVersionRepoDbConfig.schema.asyncOperations)
        .all()
        .every(
          row => row.responseRecordedAt !== null && row.nextRunAt === null,
        ),
    );
    // Source publication cleanup preserves the producer's immutable inputs and authority.
    db.delete(aggregateVersionRepoDbConfig.schema.executedCommandOutbox).run();
    db.delete(
      aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox,
    ).run();
    yield* recordResponse(
      db,
      originalRows[0]!.asyncCommandId!,
      null,
      new Date(1),
    );
    const recorded = yield* readPreparedAggregateAsyncWork(
      db,
      originalRows[0]!.asyncCommandId!,
    );
    const decoded = yield* validateExternalResponse(
      asyncObserve,
      recorded.payload,
      recorded.response,
    );
    assert.ok(decoded.payload.at instanceof Date);
    assert.equal(recorded.actorName, 'operator');
    assert.deepEqual(recorded.claims, { aggregateId: 'agg_one' });
    assert.equal(originalRows[1]!.responseRecordedAt, null);
    assert.ok(
      Result.isFailure(
        yield* Schema.decodeUnknownEffect(asyncOperationLifecycleCodec)({
          ...originalRows[1]!,
          actorName: null,
        }).pipe(Effect.result),
      ),
      'incomplete lifecycle authority is rejected through the table codec',
    );
    assert.ok(
      Result.isFailure(
        yield* Schema.decodeUnknownEffect(asyncOperationLifecycleCodec)({
          ...originalRows[1]!,
          asyncCommandId: null,
        }).pipe(Effect.result),
      ),
      'replay output cannot retain production lifecycle',
    );
    const childResponse = null;
    const rejectedContinuation = yield* Effect.gen(function* () {
      const input = yield* prepareContractInput({
        contract: asyncObserve,
        command: {
          ...command,
          payload: decoded.payload,
          response: childResponse,
        },
        claims: recorded.claims,
      });
      const made = yield* makeOperations({
        contract: asyncObserve,
        db,
        models,
        command: {
          ...command,
          id: recorded.asyncCommandId!,
          commandName: asyncObserve.commandName,
          contractVersion: asyncObserve.version,
        },
        input,
      });
      return { ...made, input };
    }).pipe(Effect.result);
    assert.ok(Result.isFailure(rejectedContinuation));
    const continuationFailure = yield* encodeFailure(
      asyncObserve,
      rejectedContinuation.failure,
    );
    yield* executeAggregate(db, {
      head: db.select().from(aggregateVersionRepoDbConfig.schema.head).get(),
      key,
      aggregate,
      preparedPage: [
        {
          command: {
            ...input,
            id: recorded.asyncCommandId!,
            commandName: asyncObserve.commandName,
            contractVersion: asyncObserve.version,
            payload: JSON.stringify(recorded.payload),
            response: childResponse,
            aggregateIndex: 4,
          },
          originalExecutionVersion: key.aggregateVersion,
          startedAt: new Date(2),
          operations: [],
          encodedResult: null,
          contractVersion: asyncObserve.version,
          failure: continuationFailure,
          contract: asyncObserve,
          payload: decoded.payload,
          guard: () => Effect.void,
        },
      ],
    });
    assert.deepEqual(
      yield* readPreparedAggregateAsyncWork(db, recorded.asyncCommandId!),
      recorded,
      'aggregate continuation rejection preserves immutable recorded observation',
    );

    const serviceActor = makeServiceActorVersion(
      { name: 'operator' },
      {
        version: '1.0.0',
        authentication: 'none',
        identity,
        db: makeActorDbVersion({ models }),
        selections: {},
        contracts: { write: mapped, asyncObserve },
      },
    );
    const service = makeServiceVersion(
      { name: 'fixture' },
      {
        version: '1.0.0',
        models,
        contracts: { write: mapped, asyncObserve },
        actors: { operator: serviceActor },
      },
    );
    const serviceDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: ownerModels,
        otherTables: serviceVersionRepoDbConfig.tables,
      }),
    });
    const serviceInput = {
      id: command.id,
      commandName: 'write',
      contractVersion: base.version,
      payload: '{"reject":false}',
      serviceName: 'fixture',
      serviceVersion: '1.0.0',
      caller: {
        actorName: 'operator',
        actorVersion: '1.0.0',
        claims: { aggregateId: 'agg_one' },
        nodeId: null,
        nodeIndex: null,
        sessionName: null,
      },
      serviceIndex: 1,
      admission,
      execution: { status: 'pending' as const },
      dispositionHash: null,
      response: null,
    };
    yield* executeService(serviceDb, {
      cursor: 0,
      key: {
        systemId: key.systemId,
        serviceName: 'fixture',
        serviceVersion: '1.0.0',
      },
      service,
      inputs: [
        {
          command: serviceInput,
          prepared: Result.succeed({ ...output, contract: mapped }),
          startedAt: new Date(0),
        },
      ],
    });
    yield* executeService(serviceDb, {
      cursor: 1,
      key: {
        systemId: key.systemId,
        serviceName: 'fixture',
        serviceVersion: '1.0.0',
      },
      service,
      inputs: [
        {
          command: {
            ...serviceInput,
            id: 'cmd_service_apply_failure',
            serviceIndex: 2,
          },
          prepared: Result.succeed({
            ...output,
            contract: mapped,
            operations: failingOperations,
          }),
          startedAt: new Date(0),
        },
        {
          command: {
            ...serviceInput,
            id: 'cmd_service_mapper_failure',
            serviceIndex: 3,
          },
          prepared: Result.fail(rejectedFailure),
          startedAt: new Date(0),
        },
      ],
    });
    assert.equal(
      serviceDb
        .select()
        .from(serviceVersionRepoDbConfig.schema.asyncOperations)
        .all().length,
      2,
    );
    assert.deepEqual(
      serviceDb
        .select()
        .from(serviceVersionRepoDbConfig.schema.commands)
        .all()
        .map(row => JSON.parse(row.execution).status),
      ['succeeded', 'failed', 'failed'],
    );
    const serviceHistory = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: serviceVersionChainDbConfig,
    });
    const deliveries = readExecutedCommandsPage(serviceDb).map(
      entry => entry.row,
    );
    yield* receiveServiceExecutedCommands({
      db: serviceHistory,
      key: { serviceName: 'fixture', serviceVersion: '1.0.0' },
      rows: deliveries,
    });
    yield* receiveServiceExecutedCommands({
      db: serviceHistory,
      key: { serviceName: 'fixture', serviceVersion: '1.0.0' },
      rows: deliveries,
    });
    assert.deepEqual(
      readServiceVersionChainOutput(serviceHistory, command.id).map(
        row => row.operationIndex,
      ),
      [0, 1, 2, 3],
    );

    yield* verifyMappedServiceProjection({
      service,
      deliveries: deliveries.map(entry => ({
        ...entry,
        executedIndex: entry.command.executedIndex,
        command: serviceHistory
          .select()
          .from(serviceVersionChainDbConfig.schema.commands)
          .all()
          .find(row => row.id === entry.command.id)!,
      })),
    });
    const serviceEmission = serviceDb
      .select()
      .from(serviceVersionRepoDbConfig.schema.asyncOperations)
      .get()!;
    yield* recordResponse(
      serviceDb,
      serviceEmission.asyncCommandId!,
      null,
      new Date(2),
    );
    const serviceObservation = yield* readPreparedAsyncWork(
      serviceDb,
      serviceEmission.asyncCommandId!,
    );
    yield* executeService(serviceDb, {
      cursor: 3,
      key: {
        systemId: key.systemId,
        serviceName: service.name,
        serviceVersion: service.version,
      },
      service,
      inputs: [
        {
          command: {
            ...serviceInput,
            id: serviceEmission.asyncCommandId!,
            commandName: asyncObserve.commandName,
            contractVersion: asyncObserve.version,
            payload: JSON.stringify(serviceObservation.payload),
            response: childResponse,
            serviceIndex: 4,
          },
          prepared: Result.fail(continuationFailure),
          startedAt: new Date(3),
        },
      ],
    });
    assert.deepEqual(
      yield* readPreparedAsyncWork(serviceDb, serviceEmission.asyncCommandId!),
      serviceObservation,
      'service continuation rejection preserves immutable recorded observation',
    );
    // Replay does not translate private payloads through ordinary adaptation edges.
    const incompatible = makeExternalContract({
      name: 'asyncObserve',
      version: '2.0.0',
      payload: { replacement: primitives.integer() },
      external: { response: Schema.Null, request: () => Effect.succeed(null) },
      program: () => Effect.void,
    });
    assert.ok(
      Result.isFailure(
        yield* validateExternalResponse(
          incompatible,
          recorded.payload,
          null,
        ).pipe(Effect.result),
      ),
    );
    const decodedOrdinary = yield* decodePayload(mapped, {
      command: { ...command, payload: '{"reject":false}' },
    });
    assert.deepEqual(decodedOrdinary, { reject: false });
    yield* Effect.promise(() => producerRuntime.dispose());
    console.log(
      'PASS: mapped base/mapper order and codecs, payload codecs, original staging, mixed output/projections, repeated history, multiple emissions, changed replay output, replay-only cold activation and source cleanup',
    );
  },
);
