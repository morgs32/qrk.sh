import assert from 'node:assert/strict';

import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  assertActorExternalContracts,
  publicContracts,
  type InferExternalPayload,
} from '@zerospin/core/contracts/externalContract';
import { validateExternalResponse } from '@zerospin/core/contracts/externalResponseCodec';
import {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
import { makeExternalContract } from '@zerospin/core/contracts/make/makeExternalContract';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { mapContractVersion } from '@zerospin/core/contracts/make/mapContractVersion';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import type { InferContractResult } from '@zerospin/core/contracts/types';
import { validateAggregateCommand } from '@zerospin/core/contracts/validateAggregateCommand';
import { validateServiceCommand } from '@zerospin/core/contracts/validateServiceCommand';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeServiceVersion } from '@zerospin/core/service/make/makeServiceVersion';
import { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { type IAnyError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { eq } from 'drizzle-orm';
import { Context, Effect, Layer, ManagedRuntime, Result, Schema } from 'effect';
import { assert as assertType, type Equals } from 'tsafe';

import { admitCommandsTx } from '../AggregateChain/admitCommands/admitCommandsTx.js';
import { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { receiveExecutedAggregateCommands } from '../AggregateChain/receiveExecutedAggregateCommands/receiveExecutedAggregateCommands.js';
import { genesisDispositionHash } from '../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { executeCommandsTx as executeAggregateTx } from '../AggregateVersionRepo/executeCommands/executeCommandsTx.js';
import { asyncOperationsDbConfig } from '../asyncOperations/asyncOperationsDbConfig.js';
import {
  makeAsyncOperations,
  recordResponse,
} from '../asyncOperations/makeAsyncOperations.js';
import { prepareAsyncOperation } from '../asyncOperations/prepareAsyncOperation.js';
import {
  readAggregateChainOutput,
  readAggregateVersionRepoOutput,
} from '../asyncOperations/readOperationOutput.js';
import {
  makePreparedAggregateCommand,
  makePreparedServiceCommand,
  readPreparedAggregateAsyncWork,
  readPreparedAsyncWork,
  resolveWorkContract,
  verifyPreparedAsyncCommand,
} from '../asyncOperations/readPreparedAsyncCommand.js';
import { checkAdmission } from '../checkAdmission.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { executeCommandsTx as executeServiceTx } from '../ServiceVersionRepo/executeCommands/executeCommandsTx.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';

import { verifyMappedContracts } from './mappedContracts.js';
/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import { runFixture } from './runFixture.js';

const sourceV1 = makeContractVersion(defineContract('begin'), {
  version: '1.0.0',
  payload: { intent: primitives.text() },
  result: Schema.Struct({ intent: Schema.String }),
  program: ({ payload }) => Effect.succeed(payload),
});
const source = upgradeContractVersion(sourceV1, {
  version: '2.0.0',
  payload: {},
  up: ({ payload }) => Effect.succeed(payload),
  result: Schema.Struct({ intent: Schema.String }),
  program: ({ payload }) => Effect.succeed(payload),
});
const Observation = Schema.NullOr(Schema.Struct({ value: Schema.Number }));
class Provider extends Context.Service<
  Provider,
  { observe(intent: string): Effect.Effect<typeof Observation.Type, IAnyError> }
>()('AsyncContractsFixture.Provider') {}
const asyncApply = makeExternalContract({
  name: 'asyncApply',
  version: '1.0.0',
  payload: { intent: primitives.text() },
  external: {
    response: Observation,
    timeoutMs: 20,
    retryDelayMs: 5,
    request: ({ payload }) =>
      Provider.use(provider => provider.observe(payload.intent)),
  },
  result: Schema.Number,
  program: ({ payload, response }) =>
    Effect.succeed(payload.intent.length + (response?.value ?? 0)),
});
assertType<
  Equals<InferExternalPayload<typeof asyncApply>, { intent: string }>
>();
assertType<Equals<InferContractResult<typeof asyncApply>, number>>();
assertType<
  Equals<
    Effect.Services<ReturnType<typeof asyncApply.external.request>>,
    Provider
  >
>();
assertType<
  Equals<Effect.Services<ReturnType<typeof asyncApply.program>>, never>
>();
const mappedSource = mapContractVersion({
  contractVersion: source,
  operations: { models: {}, contracts: { asyncApply } },
  result: Schema.Struct({ intent: Schema.String }),
  program: ({ command, operations }) =>
    Effect.gen(function* () {
      yield* operations.contracts.asyncApply(command.payload);
      return command.result;
    }),
});
const actorDb = makeActorDbVersion({ models: {} });
const identity = makeActorIdentity({
  claims: Schema.Struct({ aggregateId: Schema.String }),
  actorPath: RoutePattern.parse('/'),
});
const actor = makeAggregateActorVersion(
  { name: 'operator' },
  {
    version: '2.0.0',
    authentication: 'none',
    identity,
    db: actorDb,
    selections: {},
    contracts: { begin: mappedSource, asyncApply },
    guards: {
      asyncApply: ({ payload, response }) =>
        Effect.sync(() => {
          assertType<Equals<typeof response, typeof Observation.Type>>();
          assert.equal(payload.intent, 'null');
          assert.equal(response, null);
        }),
    },
  },
);
const aggregate = makeAggregateVersion(
  { name: 'fixture' },
  {
    version: '2.0.0',
    models: {},
    contracts: { begin: mappedSource, asyncApply },
    actors: { operator: actor },
  },
);
const serviceActor = makeServiceActorVersion(
  { name: 'operator' },
  {
    version: '2.0.0',
    authentication: 'none',
    identity,
    db: actorDb,
    selections: {},
    contracts: { begin: mappedSource, asyncApply },
    guards: {
      asyncApply: ({ payload, response }) =>
        Effect.sync(() => {
          assertType<Equals<typeof response, typeof Observation.Type>>();
          assert.equal(payload.intent, 'null');
          assert.equal(response, null);
        }),
    },
  },
);
const service = makeServiceVersion(
  { name: 'fixture' },
  {
    version: '2.0.0',
    models: {},
    contracts: { begin: mappedSource, asyncApply },
    actors: { operator: serviceActor },
  },
);
assert.throws(() => assertActorExternalContracts({ begin: mappedSource }));
assert.throws(() =>
  assertActorExternalContracts({
    begin: mappedSource,
    asyncApply: { ...asyncApply },
  }),
);
assert.deepEqual(Object.keys(publicContracts(actor.contracts)), ['begin']);
assertType<
  Equals<
    keyof ReturnType<typeof publicContracts<typeof actor.contracts>>,
    'begin'
  >
>();
const session = {
  sessionName: 'session',
  actorName: actor.name,
  actorVersion: actor.version,
  claimsSchema: identity.claimsSchema,
  models: {},
  modelNames: [],
  contracts: actor.contracts,
  aggregateName: 'fixture',
  aggregateVersion: '2.0.0',
};
assert.deepEqual(
  Object.keys(
    makeAggregateSessionLock({ ...session, kind: 'aggregate' }).contracts,
  ),
  ['begin'],
);
assert.deepEqual(
  Object.keys(
    makeServiceSessionLock({
      ...session,
      kind: 'service',
      serviceName: 'fixture',
      serviceVersion: '2.0.0',
    }).contracts,
  ),
  ['begin'],
);
const system = makeSystem({
  name: 'fixture',
  aggregates: { fixture: { '2.0.0': aggregate } },
  services: { fixture: { '2.0.0': service } },
  layer: Layer.succeed(Provider, { observe: () => Effect.succeed(null) }),
});
const spec = makeSystemSpec({ system });
assert.deepEqual(Schema.decodeUnknownSync(SystemSpecSchema)(spec), spec);
assert.equal(
  spec.aggregates.fixture?.['2.0.0']?.actors.operator?.contracts.asyncApply
    ?.external?.timeoutMs,
  20,
);

const deferred = <A>() => {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const finalizerStarted = deferred<void>();
const finalizerGate = deferred<void>();
const late = deferred<typeof Observation.Type>();
const calls: string[] = [];
let slowCalls = 0;
const fixtureLayer = Layer.mergeAll(
  AsyncLive,
  Layer.succeed(Provider, {
    observe: intent => {
      calls.push(intent);
      if (intent === 'slow' && ++slowCalls === 1) {
        return Effect.promise(() => late.promise).pipe(
          Effect.ensuring(
            Effect.promise(async () => {
              finalizerStarted.resolve();
              await finalizerGate.promise;
            }),
          ),
        );
      }
      return Effect.succeed(intent === 'null' ? null : { value: 7 });
    },
  }),
);
const runtime = ManagedRuntime.make(fixtureLayer);
const run = <A, E>(effect: Effect.Effect<A, E, unknown>) =>
  runFixture(runtime, effect);
const db = await run(
  makeProvisionedInMemorySqljsDb({ dbConfig: aggregateVersionRepoDbConfig }),
);
const chainDb = await run(
  makeProvisionedInMemorySqljsDb({ dbConfig: aggregateChainDbConfig }),
);
const key = {
  systemId: 'sys_fixture',
  aggregateId: 'acct_fixture',
  aggregateName: 'fixture',
  aggregateVersion: '2.0.0',
};
const sourceCommand = {
  id: 'cmd_source' as const,
  commandName: 'begin',
  contractVersion: sourceV1.version,
  payload: '{"intent":"slow"}',
  ...key,
  systemName: 'fixture',
  actorName: actor.name,
  actorVersion: actor.version,
  claims: { aggregateId: key.aggregateId },
  nodeId: null,
  nodeIndex: null,
  sessionName: null,
  response: null,
};
const admission = {
  status: 'succeeded' as const,
  startedAt: new Date(0),
  completedAt: new Date(0),
};
const emptyHead = {
  singletonId: 1,
  aggregateIndex: 0,
  executedIndex: 0,
  dispositionHash: genesisDispositionHash(),
};
db.insert(aggregateVersionRepoDbConfig.schema.head).values(emptyHead).run();
await run(
  executeAggregateTx(db, {
    head: emptyHead,
    aggregate,
    key,
    preparedPage: [
      {
        command: {
          ...sourceCommand,
          aggregateIndex: 1,
          admission,
          execution: { status: 'pending' },
          dispositionHash: null,
        },
        originalExecutionVersion: key.aggregateVersion,
        startedAt: new Date(0),
        operations: [
          {
            operationName: 'async',
            contract: asyncApply,
            payload: { intent: 'slow' },
            commandId: sourceCommand.id,
            operationIndex: 0,
          },
        ],
        encodedResult: { intent: 'slow' },
        contractVersion: source.version,
        failure: null,
        contract: source,
        payload: { intent: 'slow' },
        guard: () => Effect.void,
      },
    ],
  }),
);
const admittedSource = await run(
  admitCommandsTx(chainDb, [
    {
      command: sourceCommand,
      originalExecutionVersion: key.aggregateVersion,
      admission,
    },
  ]),
);
const sourceAdmission = admittedSource[0];
assert.ok(sourceAdmission);
const executedSource = db
  .select()
  .from(aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox)
  .where(
    eq(
      aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox.id,
      sourceCommand.id,
    ),
  )
  .get();
assert.ok(executedSource);
assert.equal(sourceAdmission.aggregateIndex, executedSource.aggregateIndex);
const sourceOutputs = readAggregateVersionRepoOutput(db, sourceCommand.id);
assert.equal(sourceOutputs.length, 1);
const sourceOutput = sourceOutputs[0];
assert.ok(sourceOutput && 'asyncContractName' in sourceOutput);
assert.equal('aggregateIndex' in sourceOutput, false);
const { executedIndex: sourceExecutedIndex, ...sourceEmission } = sourceOutput;
assert.equal(sourceExecutedIndex, executedSource.executedIndex);
const sourceDelivery = {
  kind: 'command' as const,
  command: executedSource,
  executedIndex: executedSource.executedIndex,
  operations: sourceOutputs,
};
await run(receiveExecutedAggregateCommands(chainDb, [sourceDelivery]));
await run(receiveExecutedAggregateCommands(chainDb, [sourceDelivery]));
const retainedResults = chainDb
  .select()
  .from(aggregateChainDbConfig.schema.results)
  .all();
assert.equal(retainedResults.length, 1);
assert.equal(
  retainedResults[0]?.aggregateIndex,
  sourceAdmission.aggregateIndex,
);
assert.equal(retainedResults[0]?.executedIndex, executedSource.executedIndex);
assert.deepEqual(readAggregateChainOutput(chainDb, sourceCommand.id), [
  { ...sourceEmission, aggregateIndex: sourceAdmission.aggregateIndex },
]);
const workRows = () =>
  db.select().from(asyncOperationsDbConfig.schema.asyncOperations).all();
assert.equal(workRows().length, 1);
assert.equal(workRows()[0]?.asyncContractVersion, '1.0.0');
const addWork = makeTx('fixture.addWork')(function* (
  tx,
  id: `cmd_${string}`,
  intent: string,
) {
  const encoded = yield* prepareAsyncOperation({
    operation: {
      operationName: 'async',
      contract: asyncApply,
      payload: { intent },
    },
    commandId: id,
    operationIndex: 0,
    committedAt: new Date(0),
    original: true,
    actor,
    claims: { aggregateId: key.aggregateId },
  });
  tx.insert(aggregateVersionRepoDbConfig.schema.asyncOperations)
    .values({ ...encoded, executedIndex: 100, systemName: 'fixture' })
    .run();
});
await run(addWork(db, 'cmd_fast', 'fast'));
await run(addWork(db, 'cmd_null', 'null'));
let alarm: number | null = null;
const alarms = makeAlarmRegistry({
  storage: {
    setAlarm: async deadline => {
      alarm = Number(deadline);
    },
    deleteAlarm: async () => {
      alarm = null;
    },
  },
});
let deliverEnabled = true;
let admitted = 0;
const deliver = Effect.fn('fixture.deliver')(function* () {
  if (!deliverEnabled) return;
  for (const row of db
    .select()
    .from(asyncOperationsDbConfig.schema.asyncCommandOutbox)
    .all()) {
    const work = yield* readPreparedAggregateAsyncWork(db, row.asyncCommandId);
    const command = yield* makePreparedAggregateCommand(work, asyncApply, key);
    const result = yield* admitCommandsTx(chainDb, [
      { command, originalExecutionVersion: key.aggregateVersion, admission },
    ]);
    assert.equal(result.length, 1);
    admitted++;
    db.delete(asyncOperationsDbConfig.schema.asyncCommandOutbox)
      .where(
        eq(
          asyncOperationsDbConfig.schema.asyncCommandOutbox.outboxIndex,
          row.outboxIndex,
        ),
      )
      .run();
  }
});
const runner = makeAsyncOperations({
  db,
  alarms,
  resolve: work => resolveWorkContract(aggregate, work),
  run,
  background: () => undefined,
  deliver,
});
await run(runner.recover());
await finalizerStarted.promise;
assert.ok(alarm !== null);
assert.equal(calls.filter(intent => intent === 'fast').length, 1);
assert.equal(admitted, 2);
assert.equal(runner.activeCount(), 1);
await run(runner.recover());
await run(alarms.run());
assert.equal(
  slowCalls,
  1,
  'an unsettled timeout finalizer retains the same-item slot',
);
finalizerGate.resolve();
await runner.settle();
late.resolve({ value: 999 });
await Promise.resolve();
assert.equal(
  workRows().find(row => row.commandId === 'cmd_source')?.responseRecordedAt,
  null,
);
const slow = workRows().find(row => row.commandId === 'cmd_source');
assert.ok(slow);
db.update(asyncOperationsDbConfig.schema.asyncOperations)
  .set({ nextRunAt: new Date(0) })
  .where(
    eq(
      asyncOperationsDbConfig.schema.asyncOperations.asyncCommandId,
      slow.asyncCommandId!,
    ),
  )
  .run();
await run(runner.recover());
await runner.settle();
assert.equal(slowCalls, 2);
assert.equal(admitted, 3);
const recorded = await run(
  readPreparedAggregateAsyncWork(db, slow.asyncCommandId!),
);
assert.deepEqual(recorded.response, { value: 7 });
const child = await run(
  makePreparedAggregateCommand(recorded, asyncApply, key),
);
const first = await run(
  admitCommandsTx(chainDb, [
    {
      command: child,
      admission,
      originalExecutionVersion: key.aggregateVersion,
    },
  ]),
);
const repeat = await run(
  admitCommandsTx(chainDb, [
    {
      command: child,
      admission,
      originalExecutionVersion: key.aggregateVersion,
    },
  ]),
);
assert.equal(first[0]?.aggregateIndex, repeat[0]?.aggregateIndex);
assert.deepEqual(child.response, { value: 7 });
assert.equal('sourceCommandId' in child, false);
assert.equal(child.id, recorded.asyncCommandId);
await run(verifyPreparedAsyncCommand(child, child));
const { response: omittedResponse, ...missingResponseChild } = child;
assert.deepEqual(omittedResponse, { value: 7 });
await assert.rejects(
  run(verifyPreparedAsyncCommand(child, missingResponseChild)),
);
await assert.rejects(
  run(
    verifyPreparedAsyncCommand(child, { ...child, response: { value: 999 } }),
  ),
);
await assert.rejects(
  run(
    validateExternalResponse(asyncApply, recorded.payload, {
      value: 'invalid',
    }),
  ),
);
await assert.rejects(
  run(
    admitCommandsTx(chainDb, [
      {
        command: {
          ...child,
          response: null,
        },
        admission,
        originalExecutionVersion: key.aggregateVersion,
      },
    ]),
  ),
);
await assert.rejects(
  run(
    checkAdmission({
      command: child,
      owners: [{ contracts: Object.values(actor.contracts) }],
      claims: child.claims,
    }),
  ),
);
await assert.rejects(
  run(
    checkAdmission({
      command: { ...child, response: null },
      owners: [{ contracts: Object.values(actor.contracts) }],
      claims: child.claims,
    }),
  ),
);
await assert.rejects(
  run(
    checkAdmission({
      command: { ...sourceCommand, response: null },
      owners: [{ contracts: Object.values(actor.contracts) }],
      claims: sourceCommand.claims,
    }),
  ),
);
const target = makeExternalContract({
  name: 'asyncApply',
  version: '2.0.0',
  payload: { intent: primitives.text() },
  external: {
    response: Observation,
    request: () => {
      throw new Error('Replay must not call the provider');
    },
  },
  result: Schema.Number,
  program: ({ response }) => Effect.succeed((response?.value ?? 0) * 2),
});
await run(
  validateExternalResponse(asyncApply, recorded.payload, child.response!),
);
const applied = await run(
  Effect.gen(function* () {
    const input = yield* prepareContractInput({
      contract: target,
      command: { ...child, payload: recorded.payload },
      claims: child.claims,
    });
    const made = yield* makeOperations({
      contract: target,
      db,
      models: {},
      command: { ...child },
      input,
    });
    return { ...made, input };
  }),
);
assert.equal(applied.encodedResult, 14);
const callsBeforeRecovery = calls.length;
const coldRunner = makeAsyncOperations({
  db,
  alarms: makeAlarmRegistry({
    storage: {
      setAlarm: async () => undefined,
      deleteAlarm: async () => undefined,
    },
  }),
  resolve: work => resolveWorkContract(aggregate, work),
  run,
  background: () => undefined,
  deliver,
});
await run(coldRunner.recover());
await coldRunner.settle();
assert.equal(calls.length, callsBeforeRecovery);
const nullWork = workRows().find(row => row.commandId === 'cmd_null');
assert.ok(nullWork);
assert.equal(
  (await run(readPreparedAggregateAsyncWork(db, nullWork.asyncCommandId!)))
    .response,
  null,
);
assert.ok(
  workRows().find(row => row.commandId === 'cmd_null')?.responseRecordedAt,
);
const nullChild = await run(
  makePreparedAggregateCommand(
    await run(readPreparedAggregateAsyncWork(db, nullWork.asyncCommandId!)),
    asyncApply,
    key,
  ),
);
assert.equal(nullChild.response, null);
await run(verifyPreparedAsyncCommand(nullChild, nullChild));
assert.equal(
  (
    await run(
      prepareContractInput({
        contract: asyncApply,
        command: { ...nullChild, payload: { intent: 'null' } },
        claims: nullChild.claims,
      }),
    )
  ).response,
  null,
);

await run(
  validateAggregateCommand({
    aggregate,
    actorName: actor.name,
    contract: asyncApply,
    db,
    payload: { intent: 'null' },
    claims: nullChild.claims,
    response: null,
  }),
);

// An admitted continuation owns its complete replay input independently of its source and producer row.
chainDb
  .delete(aggregateChainDbConfig.schema.commands)
  .where(eq(aggregateChainDbConfig.schema.commands.id, sourceCommand.id))
  .run();
db.delete(aggregateVersionRepoDbConfig.schema.executedCommandOutbox)
  .where(
    eq(
      aggregateVersionRepoDbConfig.schema.executedCommandOutbox.id,
      sourceCommand.id,
    ),
  )
  .run();
db.delete(aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox)
  .where(
    eq(
      aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox.id,
      sourceCommand.id,
    ),
  )
  .run();
db.delete(asyncOperationsDbConfig.schema.asyncOperations)
  .where(
    eq(asyncOperationsDbConfig.schema.asyncOperations.asyncCommandId, child.id),
  )
  .run();
await assert.rejects(run(readPreparedAggregateAsyncWork(db, child.id)));
const retainedChild = await run(
  aggregateChainDbConfig.tables.commands
    .decodeRow(
      chainDb
        .select()
        .from(aggregateChainDbConfig.schema.commands)
        .where(eq(aggregateChainDbConfig.schema.commands.id, child.id))
        .get(),
    )
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.toType(EncodedAggregateCommandSchema),
        ),
      ),
    ),
);
const replayAfterCleanup = await run(
  Effect.gen(function* () {
    const input = yield* prepareContractInput({
      contract: target,
      command: { ...retainedChild, payload: JSON.parse(retainedChild.payload) },
      claims: retainedChild.claims,
    });
    return yield* makeOperations({
      contract: target,
      db,
      models: {},
      command: retainedChild,
      input,
    });
  }),
);
assert.equal(replayAfterCleanup.encodedResult, 14);

// A failed enqueue rolls the observation marker back with it; deleting a row never reuses the sequence.
await run(addWork(db, 'cmd_rollback', 'rollback'));
const rollback = workRows().find(row => row.commandId === 'cmd_rollback');
assert.ok(rollback);
const beforeIndex = db
  .select()
  .from(asyncOperationsDbConfig.schema.asyncCommandOutboxHead)
  .get()!.lastIndex;
db.insert(asyncOperationsDbConfig.schema.asyncCommandOutbox)
  .values(
    await run(
      asyncOperationsDbConfig.tables.asyncCommandOutbox.encodeRow({
        outboxIndex: beforeIndex + 1,
        asyncCommandId: 'cmd_collision',
        lastDeliveryFailure: null,
      }),
    ),
  )
  .run();
await assert.rejects(
  run(recordResponse(db, rollback.asyncCommandId!, { value: 8 }, new Date())),
);
assert.equal(
  workRows().find(row => row.asyncCommandId === rollback.asyncCommandId!)
    ?.responseRecordedAt,
  null,
);
db.delete(asyncOperationsDbConfig.schema.asyncCommandOutbox).run();
await run(
  recordResponse(db, rollback.asyncCommandId!, { value: 8 }, new Date()),
);
assert.equal(
  db.select().from(asyncOperationsDbConfig.schema.asyncCommandOutboxHead).get()!
    .lastIndex,
  beforeIndex + 1,
);
await run(
  recordResponse(db, rollback.asyncCommandId!, { value: 900 }, new Date()),
);
assert.deepEqual(
  (await run(readPreparedAggregateAsyncWork(db, rollback.asyncCommandId!)))
    .response,
  { value: 8 },
);

// Service source transaction has the same original-version eligibility.
const serviceDb = await run(
  makeProvisionedInMemorySqljsDb({ dbConfig: serviceVersionRepoDbConfig }),
);
await run(
  executeServiceTx(serviceDb, {
    cursor: 0,
    service,
    key: {
      systemId: 'sys_fixture',
      serviceName: 'fixture',
      serviceVersion: service.version,
    },
    inputs: [
      {
        command: {
          id: 'cmd_service',
          commandName: 'begin',
          contractVersion: source.version,
          payload: '{"intent":"service"}',
          serviceName: 'fixture',
          serviceVersion: service.version,
          caller: {
            actorName: actor.name,
            actorVersion: actor.version,
            claims: { aggregateId: 'acct_fixture' },
            nodeId: null,
            nodeIndex: null,
            sessionName: null,
          },
          admission,
          execution: { status: 'pending' },
          dispositionHash: null,
          serviceIndex: 1,
        },
        prepared: Result.succeed({
          contract: mappedSource,
          contractVersion: source.version,
          input: {
            payload: { intent: 'service' },
            claims: { aggregateId: 'acct_fixture' },
          },
          operations: [
            {
              operationName: 'async',
              contract: asyncApply,
              payload: { intent: 'service' },
            },
          ],
          encodedResult: { intent: 'service' },
        }),
        startedAt: new Date(0),
      },
    ],
  }),
);
assert.equal(
  serviceDb.select().from(asyncOperationsDbConfig.schema.asyncOperations).all()
    .length,
  1,
);
const servicePendingWork = serviceDb
  .select()
  .from(asyncOperationsDbConfig.schema.asyncOperations)
  .get();
assert.ok(servicePendingWork);
await run(
  recordResponse(
    serviceDb,
    servicePendingWork.asyncCommandId!,
    { value: 42 },
    new Date(),
  ),
);
const servicePendingCommand = serviceDb
  .select()
  .from(asyncOperationsDbConfig.schema.asyncCommandOutbox)
  .get();
assert.ok(servicePendingCommand);
const serviceRecorded = await run(
  readPreparedAsyncWork(serviceDb, servicePendingCommand.asyncCommandId),
);
const serviceQueued = await run(
  makePreparedServiceCommand(serviceRecorded, asyncApply, {
    serviceName: service.name,
    serviceVersion: service.version,
  }),
);
assert.equal(serviceQueued.ownerKind, 'service');
assert.equal(serviceQueued.id, serviceRecorded.asyncCommandId);
assert.deepEqual(serviceQueued.response, { value: 42 });
assert.equal('sourceCommandId' in serviceQueued, false);
assert.deepEqual(serviceQueued.caller?.claims, serviceRecorded.claims);
await run(verifyPreparedAsyncCommand(serviceQueued, serviceQueued));
const { response: omittedServiceResponse, ...missingServiceResponse } =
  serviceQueued;
assert.deepEqual(omittedServiceResponse, { value: 42 });
await assert.rejects(
  run(verifyPreparedAsyncCommand(serviceQueued, missingServiceResponse)),
);
await assert.rejects(
  run(
    verifyPreparedAsyncCommand(serviceQueued, {
      ...serviceQueued,
      response: { value: 999 },
    }),
  ),
);
const serviceNullEmission = await run(
  prepareAsyncOperation({
    operation: {
      operationName: 'async',
      contract: asyncApply,
      payload: { intent: 'null' },
    },
    commandId: 'cmd_service_null',
    operationIndex: 0,
    committedAt: new Date(),
    original: true,
    actor: serviceActor,
    claims: { aggregateId: key.aggregateId },
  }),
);
serviceDb
  .insert(serviceVersionRepoDbConfig.schema.asyncOperations)
  .values({ ...serviceNullEmission, serviceIndex: 2 })
  .run();
assert.ok(serviceNullEmission.asyncCommandId);
await run(
  recordResponse(
    serviceDb,
    serviceNullEmission.asyncCommandId,
    null,
    new Date(),
  ),
);
const serviceNullWork = await run(
  readPreparedAsyncWork(serviceDb, serviceNullEmission.asyncCommandId),
);
assert.ok(serviceNullWork.responseRecordedAt);
const serviceNullCommand = await run(
  makePreparedServiceCommand(serviceNullWork, asyncApply, {
    serviceName: service.name,
    serviceVersion: service.version,
  }),
);
assert.equal(serviceNullCommand.response, null);
await run(verifyPreparedAsyncCommand(serviceNullCommand, serviceNullCommand));
await run(
  validateServiceCommand({
    service,
    caller: serviceNullCommand.caller,
    contract: asyncApply,
    db: serviceDb,
    payload: { intent: 'null' },
    response: null,
  }),
);
console.log(
  'PASS: complete canonical async service command retains frozen input and caller without duplicate aggregate provenance',
);
await run(verifyMappedContracts());
await runtime.dispose();
await system.runtime.dispose();
console.log(
  'PASS: async inference/registration/specs/privacy; atomic original retention for both owners; executing-source version attribution',
);
console.log(
  'PASS: independent progress, timeout finalizer settlement, late-promise fencing, null evidence, cold delivery recovery',
);
console.log(
  'PASS: immutable recording/enqueue rollback, monotonic outbox, admission retry/conflict/public rejection, changed-program replay',
);
