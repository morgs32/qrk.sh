import assert from 'node:assert/strict';

import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { replayPendingCommandsTx } from '@zerospin/core/aggregateSession/replayPendingCommandsTx';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { stageSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx';
import { StagingResultSchema } from '@zerospin/core/aggregateSession/StagingResultSchema';
import type { IAggregateSession } from '@zerospin/core/aggregateSession/types';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { AssertContractOperationsInModels } from '@zerospin/core/contracts/assertOperationsUseModels';
import type { ICreateOperation } from '@zerospin/core/contracts/createOperation';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import {
  encodeContractResult,
  resolveContractResult,
} from '@zerospin/core/contracts/resultCodec';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import type {
  IContract,
  InferContractOperations,
  InferContractResult,
} from '@zerospin/core/contracts/types';
import type { IUpdateOperation } from '@zerospin/core/contracts/updateOperation';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { IAnyModels } from '@zerospin/core/models/types';
import { filterServiceBrowserCommand } from '@zerospin/core/serviceSession/filterServiceBrowserCommand';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import {
  bindServiceSessionExecution,
  stageServiceCommand,
} from '@zerospin/core/serviceSession/stageServiceCommand';
import type { IServiceBrowserCommand } from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { Context, Effect, Result, Schema, SchemaGetter } from 'effect';
import { assert as assertType, type Equals } from 'tsafe';

import { executeCommandsTx as executeServiceCommandsTx } from '../ServiceVersionRepo/executeCommands/executeCommandsTx.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';

import { verifyActorDelivery } from './actorDelivery.js';
import { verifyAdmissionTerminal } from './admissionTerminal.js';
import { verifyCommandForwarding } from './commandForwarding.js';

class Label extends Context.Service<Label, string>()('ContractFixture.Label') {}
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { name: primitives.text() },
    indexes: [],
  },
);
const contract = makeContractVersion(defineContract('write'), {
  version: '1.0.0',
  payload: {},
  models: { item },
  result: Schema.Struct({ label: Schema.String, at: Schema.DateFromString }),
  program: ({ models }) =>
    Effect.gen(function* () {
      const label = yield* Label;
      models.item.delete({ resourceId: 'itm_unused' });
      yield* models.item.create({
        resourceId: 'itm_one',
        attributes: { name: label },
      });
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { name: 'changed' },
      });
      return { label, at: new Date(0) };
    }),
});
assertType<
  Equals<
    InferContractResult<typeof contract>,
    { readonly label: string; readonly at: Date }
  >
>();
assertType<
  Equals<
    InferContractOperations<typeof contract>,
    ICreateOperation<typeof item> | IUpdateOperation<typeof item>
  >
>();
const next = upgradeContractVersion(contract, {
  version: '2.0.0',
  payload: {},
  result: Schema.Struct({ count: Schema.Number }),
  up: ({ payload }) => Effect.succeed(payload),
  program: ({ models }) =>
    Effect.gen(function* () {
      yield* models.item.delete({ resourceId: 'itm_one' });
      return { count: 1 };
    }),
});
assertType<
  Equals<InferContractResult<typeof next>, { readonly count: number }>
>();
const noResult = makeContractVersion(defineContract('empty'), {
  version: '1.0.0',
  payload: {},
});
assertType<Equals<InferContractResult<typeof noResult>, void>>();
assertType<Equals<InferContractOperations<typeof noResult>, never>>();
// @ts-expect-error Emitted operations require their exact owner model.
const wrongOwner: AssertContractOperationsInModels<typeof contract, {}> =
  contract;
void wrongOwner;
makeContractVersion(defineContract('invalid'), {
  version: '1.0.0',
  payload: {},
  // @ts-expect-error A result requires a declared codec.
  program: () => Effect.succeed({ value: 1 }),
});
makeContractVersion(defineContract('invalidTyped'), {
  version: '1.0.0',
  payload: {},
  result: Schema.Struct({ value: Schema.Number }),
  // @ts-expect-error Returned fields must satisfy the result codec.
  program: () => Effect.succeed({ value: 'wrong' }),
});

await Effect.runPromise(
  Effect.gen(function* () {
    yield* verifyActorDelivery();
    yield* verifyAdmissionTerminal();
    yield* verifyCommandForwarding();
    const dbConfig = makeResourceDbConfig({
      models: { item },
      otherTables: {},
    });
    const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
    const run = <C extends IContract>(value: C) =>
      prepareContractInput({
        contract: value,
        command: { payload: {} },
        claims: null,
      }).pipe(
        Effect.flatMap(input =>
          makeOperations({
            db,
            models: { item },
            contract: value,
            command: {
              id: 'cmd_test',
              commandName: value.commandName,
              contractVersion: value.version,
            },
            input,
          }).pipe(Effect.map(made => ({ ...made, input }))),
        ),
      );
    assertType<
      Equals<Effect.Services<ReturnType<typeof run<typeof contract>>>, Label>
    >();
    const program = run(contract).pipe(Effect.provideService(Label, 'local'));
    const first = yield* program;
    assert.deepEqual(
      first.operations.map(operation => operation.operationName),
      ['create', 'update'],
    );
    assert.deepEqual(first.encodedResult, {
      label: 'local',
      at: new Date(0).toISOString(),
    });
    assert.equal(db.query.item.findFirst().sync(), undefined);
    const second = yield* program;
    assert.equal(second.operations.length, 2);
    assert.notEqual(first.operations, second.operations);
    const authoritative = yield* run(contract).pipe(
      Effect.provideService(Label, 'server'),
    );
    assert.equal(first.result.label, 'local');
    assert.equal(authoritative.result.label, 'server');
    assert.equal(first.contractVersion, contract.version);
    assert.equal((yield* run(next)).contractVersion, next.version);
    assert.deepEqual(
      yield* resolveContractResult(contract, {
        commandName: 'write',
        contractVersion: contract.version,
        result: first.encodedResult,
      }),
      first.result,
    );
    assert.equal(
      (yield* resolveContractResult(contract, {
        commandName: 'write',
        contractVersion: next.version,
        result: first.encodedResult,
      }).pipe(Effect.result))._tag,
      'Failure',
    );
    assert.equal(
      (yield* resolveContractResult(contract, {
        commandName: 'other',
        contractVersion: contract.version,
        result: first.encodedResult,
      }).pipe(Effect.result))._tag,
      'Failure',
    );
    const empty = yield* run(noResult);
    assert.equal(empty.result, undefined);
    assert.equal(empty.encodedResult, null);
    assert.equal(
      yield* resolveContractResult(noResult, {
        commandName: noResult.commandName,
        contractVersion: noResult.version,
        result: null,
      }),
      undefined,
    );
    assert.equal(
      (yield* encodeContractResult(noResult, {}).pipe(Effect.result))._tag,
      'Failure',
    );
    assert.equal(
      (yield* encodeContractResult(contract, { label: 1, at: new Date() }).pipe(
        Effect.result,
      ))._tag,
      'Failure',
    );
    assert.equal(
      (yield* encodeContractResult(
        { ...contract, result: Schema.Unknown },
        () => {},
      ).pipe(Effect.result))._tag,
      'Failure',
    );
    const retrying = makeContractVersion(defineContract('retrying'), {
      version: '1.0.0',
      payload: {},
      models: { item },
      program: ({ models }) =>
        Effect.gen(function* () {
          let attempts = 0;
          yield* Effect.gen(function* () {
            yield* models.item.delete({ resourceId: 'itm_one' });
            if (attempts++ === 0) {
              return yield* Effect.fail(makeZerospinError('fixture-retry'));
            }
          }).pipe(Effect.retry({ times: 1 }));
          yield* models.item
            .update({ resourceId: 'itm_one', attributes: { name: 'caught' } })
            .pipe(
              Effect.andThen(Effect.fail(makeZerospinError('fixture-caught'))),
              Effect.catch(() => Effect.void),
            );
        }),
    });
    assert.deepEqual(
      (yield* run(retrying)).operations.map(
        operation => operation.operationName,
      ),
      ['delete', 'delete', 'update'],
    );
    const failing = makeContractVersion(defineContract('failing'), {
      version: '1.0.0',
      payload: {},
      models: { item },
      program: ({ models }) =>
        Effect.gen(function* () {
          yield* models.item.delete({ resourceId: 'itm_one' });
          return yield* Effect.fail(makeZerospinError('fixture-failure'));
        }),
    });
    const failed = yield* run(failing).pipe(Effect.result);
    assert.equal(failed._tag, 'Failure');
    const asyncContract = makeContractVersion(defineContract('async'), {
      version: '1.0.0',
      payload: {},
      program: () => Effect.promise(() => Promise.resolve()),
    });
    const asyncFailure = yield* run(asyncContract).pipe(Effect.result);
    assert.ok(asyncFailure._tag === 'Failure');
    assert.equal(asyncFailure.failure.code, 'program-must-be-synchronous');
    const asyncCodec = Schema.String.pipe(
      Schema.decodeTo(Schema.String, {
        decode: SchemaGetter.transformOrFail(value =>
          Effect.promise(() => Promise.resolve(value)),
        ),
        encode: SchemaGetter.transformOrFail(value =>
          Effect.promise(() => Promise.resolve(value)),
        ),
      }),
    );
    const codecFailure = yield* encodeContractResult(
      { ...contract, result: asyncCodec },
      'value',
    ).pipe(Effect.result);
    assert.ok(codecFailure._tag === 'Failure');
    assert.equal(codecFailure.failure.code, 'program-must-be-synchronous');
    const invalidGuard = makeContractVersion(defineContract('guard'), {
      version: '1.0.0',
      payload: {},
      guard: () => Effect.succeed('unexpected'),
    });
    const guardFailure = yield* run(invalidGuard).pipe(Effect.result);
    assert.ok(guardFailure._tag === 'Failure');
    assert.equal(guardFailure.failure.code, 'contract-guard-result-invalid');
    let payloadDecodes = 0;
    let payloadEncodes = 0;
    let claimsChecks = 0;
    const datePayload = Schema.String.pipe(
      Schema.decodeTo(Schema.Date, {
        decode: SchemaGetter.transform(value => {
          payloadDecodes++;
          return new Date(value);
        }),
        encode: SchemaGetter.transform(value => {
          payloadEncodes++;
          return value.toISOString();
        }),
      }),
    );
    const preparedClaims = Schema.Struct({
      at: Schema.DateFromString.check(
        Schema.makeFilter(() => {
          claimsChecks++;
          return true;
        }),
      ),
    });
    const authenticatedClaims = yield* Schema.decodeUnknownEffect(
      preparedClaims,
    )({ at: new Date(0).toISOString() });
    claimsChecks = 0;
    const guardPayloads: unknown[] = [];
    const guardClaims: unknown[] = [];
    const guardNames: (string | undefined)[] = [];
    const preparedContract = makeContractVersion(defineContract('prepared'), {
      version: '1.0.0',
      models: { item },
      claims: preparedClaims,
      payload: {
        at: primitives.json({ schema: datePayload }),
        label: primitives.text({ defaultValue: 'default' }),
      },
      result: Schema.DateFromString,
      guard: ({ db, payload, claims }) =>
        Effect.sync(() => {
          guardPayloads.push(payload);
          guardClaims.push(claims);
          guardNames.push(db.query.item.findFirst().sync()?.name);
        }),
      program: ({ payload, claims }) =>
        Effect.sync(() => {
          assert.equal(payload, guardPayloads[0]);
          assert.equal(claims, guardClaims[0]);
          assert.equal(payload.label, 'default');
          assert.ok(payload.at instanceof Date);
          assert.ok(claims.at instanceof Date);
          return payload.at;
        }),
    });
    const input = yield* prepareContractInput({
      contract: preparedContract,
      command: { payload: { at: new Date(0) } },
      claims: authenticatedClaims,
    });
    const preparedCounts = { payloadDecodes, payloadEncodes, claimsChecks };
    assert.equal(payloadDecodes, 1);
    assert.equal(payloadEncodes, 1);
    assert.equal(claimsChecks, 1);
    const preparedOutput = yield* makeOperations({
      db,
      contract: preparedContract,
      models: { item },
      command: {
        id: 'cmd_prepared',
        commandName: preparedContract.commandName,
        contractVersion: preparedContract.version,
      },
      input,
    });
    assert.ok(preparedOutput.result instanceof Date);
    assert.equal(preparedOutput.encodedResult, new Date(0).toISOString());
    db.insert(dbConfig.schema.item)
      .values({
        id: 'itm_guard',
        name: 'committed',
        modelName: item.modelName,
        version: item.version,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })
      .run();
    yield* makeTx('fixture.preparedGuard')(function* (tx) {
      yield* runContractGuard({ contract: preparedContract, db: tx, input });
    })(db);
    assert.deepEqual(guardNames, [undefined, 'committed']);
    assert.equal(guardPayloads[1], guardPayloads[0]);
    assert.equal(guardClaims[1], guardClaims[0]);
    assert.deepEqual(
      { payloadDecodes, payloadEncodes, claimsChecks },
      preparedCounts,
    );
    db.delete(item.drizzleSchema).run();
    const invalidClaims = yield* prepareContractInput({
      contract: preparedContract,
      command: { payload: { at: new Date(0) } },
      claims: { at: 'still-encoded' },
    }).pipe(Effect.result);
    assert.ok(Result.isFailure(invalidClaims));
    assert.equal(invalidClaims.failure.code, 'contract-claims-invalid');
    assert.equal(contract.spec.resultJsonSchema !== null, true);
    assert.equal(noResult.spec.resultJsonSchema, null);
    const echo = makeContractVersion(defineContract('echo'), {
      version: '1.0.0',
      payload: {},
      result: Schema.Struct({
        label: Schema.String,
        at: Schema.DateFromString,
      }),
      program: () =>
        Effect.gen(function* () {
          return { label: yield* Label, at: new Date(0) };
        }),
    });
    const definition = {
      kind: 'aggregate' as const,
      systemName: 'fixture',
      aggregateName: 'fixture',
      aggregateVersion: '1.0.0',
      actorName: 'actor',
      actorVersion: '1.0.0',
      sessionName: 'session',
      claimsSchema: Schema.Struct({}),
      models: { item },
      modelNames: ['item'],
      contracts: { echo },
    };
    const sessionDbConfig = makeResourceDbConfig({
      models: { item },
      otherTables: sessionRepoDbConfig.tables,
    });
    const sessionDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: sessionDbConfig,
    });
    const sessionCommand = {
      id: 'cmd_staging' as const,
      commandName: echo.commandName,
      contractVersion: echo.version,
      payload: {},
      aggregateId: 'agg_fixture',
      aggregateName: definition.aggregateName,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      sessionName: definition.sessionName,
      sessionId: 'sesn_fixture' as const,
      pushIndex: null,
      claims: {},
    };
    const staged = yield* stageSessionCommandTx(sessionDb, {
      contract: echo,
      sessionId: sessionCommand.sessionId,
      command: sessionCommand,
      madeOperations: yield* run(echo).pipe(
        Effect.provideService(Label, 'original'),
      ),
      startedAt: new Date(0),
      state: {
        aggregateIndex: 0,
        executedIndex: 0,
        executedHash: '0'.repeat(64),
        pushIndex: 0,
      },
    });
    const local = yield* resolveContractResult(echo, {
      ...sessionCommand,
      result: staged.encodedCommand.staging.result,
    });
    assert.ok(staged.command.staging.result.at instanceof Date);
    assert.equal(local.label, 'original');
    assert.ok(local.at instanceof Date);
    const assertStageType = (session: IAggregateSession<typeof definition>) => {
      const result = stageCommand({
        session,
        contractName: 'echo',
        payload: {},
      });
      if (result._tag === 'Success') {
        assertType<
          Equals<
            typeof result.success.staging.result,
            { readonly label: string; readonly at: Date }
          >
        >();
      }
    };
    void assertStageType;
    const journal = sessionDb
      .select()
      .from(sessionRepoDbConfig.schema.commands)
      .get();
    assert.ok(journal);
    const originalStaging = journal.staging;
    const replay = makeTx('fixture.replay')(function* (tx) {
      yield* replayPendingCommandsTx({ tx, definition });
    });
    yield* replay(sessionDb).pipe(Effect.provideService(Label, 'replayed'));
    assert.equal(
      sessionDb.select().from(sessionRepoDbConfig.schema.commands).get()
        ?.staging,
      originalStaging,
    );
    const serviceDefinition = {
      ...definition,
      kind: 'service' as const,
      serviceName: 'service',
      serviceVersion: '1.0.0',
    };
    assert.deepEqual(
      makeAggregateSessionLock(definition).contracts.echo?.resultJsonSchema,
      echo.spec.resultJsonSchema,
    );
    assert.deepEqual(
      makeServiceSessionLock(serviceDefinition).contracts.echo
        ?.resultJsonSchema,
      echo.spec.resultJsonSchema,
    );
    const serviceSession = makeServiceSession({
      definition: serviceDefinition,
      models: { item },
    });
    let stageCalls = 0;
    const unbind = bindServiceSessionExecution(serviceSession, {
      can: () => ({ _tag: 'Success', success: undefined }),
      accept: async () => ({ _tag: 'Success', success: undefined }),
      stage: () => {
        stageCalls++;
        return {
          _tag: 'Success',
          success: {
            id: 'cmd_service',
            commandName: echo.commandName,
            payload: '{}',
            contractVersion: echo.version,
            serviceName: 'service',
            actorName: 'actor',
            actorVersion: '1.0.0',
            sessionName: 'session',
            claims: {},
            staging: Schema.encodeSync(StagingResultSchema)(
              staged.encodedCommand.staging,
            ),
          },
        };
      },
    });
    const serviceStage = yield* Effect.promise(() =>
      stageServiceCommand({
        session: serviceSession,
        contractName: 'echo',
        payload: {},
      }),
    );
    assert.ok(serviceStage._tag === 'Success');
    assert.ok(serviceStage.success.staging.result.at instanceof Date);
    assert.equal(serviceStage.success.staging.result.label, 'original');
    assert.equal(stageCalls, 1);
    unbind();
    const broken = makeContractVersion(defineContract('broken'), {
      version: '1.0.0',
      payload: {},
      models: { item },
      result: Schema.String,
      program: ({ models }) =>
        Effect.gen(function* () {
          yield* models.item.create({
            resourceId: 'itm_transaction',
            attributes: { name: 'temporary' },
          });
          yield* models.item.delete({ resourceId: 'itm_missing' });
          return 'must-not-survive';
        }),
    });
    const service = {
      name: 'service',
      version: '1.0.0',
      models: { item },
      contracts: { echo, broken },
      actors: {},
      queries: {},
    };
    const serviceModels: IAnyModels = { item };
    const serviceDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: serviceModels,
        otherTables: serviceVersionRepoDbConfig.tables,
      }),
    });
    const admitted = {
      id: 'cmd_service_success' as const,
      commandName: echo.commandName,
      payload: '{}',
      contractVersion: '0.9.0',
      serviceName: service.name,
      serviceVersion: service.version,
      serviceIndex: 1,
      caller: null,
      admission: {
        status: 'succeeded' as const,
        startedAt: new Date(0),
        completedAt: new Date(1),
      },
      execution: { status: 'pending' as const },
      dispositionHash: null,
    };
    const key = {
      systemId: 'fixture',
      serviceName: service.name,
      serviceVersion: service.version,
    };
    yield* executeServiceCommandsTx(serviceDb, {
      cursor: 0,
      service,
      key,
      inputs: [
        {
          command: admitted,
          startedAt: new Date(2),
          prepared: Result.succeed({
            ...(yield* run(echo).pipe(
              Effect.provideService(Label, 'authoritative'),
            )),
            contract: echo,
          }),
        },
      ],
    });
    const serviceSuccess = serviceDb
      .select()
      .from(serviceVersionRepoDbConfig.schema.commands)
      .get();
    assert.ok(serviceSuccess);
    assert.equal(
      JSON.parse(serviceSuccess.execution).contractVersion,
      echo.version,
    );
    assert.equal(
      JSON.parse(serviceSuccess.execution).result.label,
      'authoritative',
    );
    yield* executeServiceCommandsTx(serviceDb, {
      cursor: 1,
      service,
      key,
      inputs: [
        {
          command: {
            ...admitted,
            id: 'cmd_service_failure',
            commandName: broken.commandName,
            contractVersion: broken.version,
            serviceIndex: 2,
          },
          startedAt: new Date(3),
          prepared: Result.succeed({
            ...(yield* run(broken)),
            contract: broken,
          }),
        },
      ],
    });
    assert.equal(serviceDb.select().from(item.drizzleSchema).all().length, 0);
    const serviceFailure = serviceDb
      .select()
      .from(serviceVersionRepoDbConfig.schema.commands)
      .all()
      .find(row => row.serviceIndex === 2);
    assert.ok(serviceFailure);
    assert.equal(JSON.parse(serviceFailure.execution).status, 'failed');
    assert.equal('result' in JSON.parse(serviceFailure.execution), false);
    const output: IServiceBrowserCommand = {
      serviceIndex: 1,
      executedIndex: 1,
      serviceHash: '0'.repeat(64),

      id: 'cmd_private',
      commandName: 'echo',
      delta: { upserted: [], deleted: [] },
      admission: {
        status: 'succeeded',
        startedAt: new Date(0),
        completedAt: new Date(1),
      },
      execution: {
        status: 'failed',
        startedAt: new Date(2),
        completedAt: new Date(3),
        failure: {
          _tag: 'ZerospinError',
          code: 'private-failure',
          message: 'Private',
          status: 400,
          extra: null,
        },
      },
    };
    const owner = {
      actorName: 'actor',
      actorVersion: '1.0.0',
      nodeId: 'owner',
      sessionName: 'session',
      nodeIndex: 1,
      claims: {},
    };
    const hidden = filterServiceBrowserCommand(
      output,
      {},
      { nodeId: 'other', sessionName: 'session', claims: {} },
      owner,
    );
    assert.equal(hidden.admission, null);
    assert.equal(hidden.execution, null);
    assert.deepEqual(
      Object.keys(hidden).sort(),
      [
        'delta',
        'admission',
        'execution',
        'id',
        'commandName',
        'executedIndex',
        'serviceHash',
        'serviceIndex',
      ].sort(),
    );
    for (const caller of [
      { nodeId: 'owner', sessionName: 'other', claims: {} },
      { nodeId: 'owner', sessionName: 'session', claims: { different: true } },
    ]) {
      assert.equal(
        filterServiceBrowserCommand(output, {}, caller, owner).execution,
        null,
      );
    }
    const visible = filterServiceBrowserCommand(
      output,
      {},
      { nodeId: 'owner', sessionName: 'session', claims: {} },
      owner,
    );
    assert.deepEqual(visible.admission, output.admission);
    assert.deepEqual(visible.execution, output.execution);
    console.log(
      'PASS: exact result/operation/service types, fresh ordered collectors, codec round trips, failure/retry semantics and synchronous execution',
    );
  }).pipe(
    Effect.provide(AsyncLive),
    Effect.provideContext(Context.makeUnsafe<unknown>(new Map())),
  ),
);
