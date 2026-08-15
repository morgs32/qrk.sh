import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { Effect, Either, Layer, Schema } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSystemRuntime } from '../makeSystemRuntime.js';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver.js';

import { SystemApi } from './SystemApi.js';
import { SystemApiFailure } from './SystemApiFailure/SystemApiFailure.js';

const { getSystemRepo } = vi.hoisted(() => ({ getSystemRepo: vi.fn() }));
vi.mock('../SystemRepo/SystemRepo.js', () => ({
  SystemRepo: { getRepo: getSystemRepo },
}));

const getSystemWorker = vi.fn();
const actorRef = {
  aggregateId: Schema.decodeUnknownSync(makeAbbreviationIdSchema('acct'))(
    'acct_1',
  ),
  aggregateName: 'main',
  userId: 'user_1',
};
const aggregateFrontendLock = {
  systemName: 'shopping',
  frontendName: 'web',
  models: {},
  contracts: {},
} satisfies IFrontendControllerSpec['aggregateFrontendLock'];
const runtime = makeSystemRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
});

describe('SystemApi', () => {
  beforeEach(() => {
    getSystemRepo.mockReset();
    getSystemWorker.mockReset();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('strictly rejects malformed empty and one-argument tuples before resolving a SystemWorker', async () => {
    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    // Step 1: A zero-argument method rejects an unexpected positional argument.
    const invalidEmptyTupleEnvelope = await Reflect.apply(api.hello, api, [
      {
        args: ['unexpected'],
        traceContext: null,
      },
    ]);
    const invalidEmptyTuple = await Effect.runPromise(
      decodeRpc(invalidEmptyTupleEnvelope.result).pipe(Effect.either),
    );

    // Step 2: A one-argument method rejects a missing positional argument.
    const missingArgumentEnvelope = await Reflect.apply(
      api.executeServiceQuery,
      api,
      [
        {
          args: [],
          traceContext: null,
        },
      ],
    );
    const missingArgument = await Effect.runPromise(
      decodeRpc(missingArgumentEnvelope.result).pipe(Effect.either),
    );

    // Step 3: A one-argument method rejects a second positional argument.
    const excessArgumentEnvelope = await Reflect.apply(
      api.executeServiceQuery,
      api,
      [
        {
          args: [
            {
              serviceName: 'products',
              queryName: 'list',
              params: null,
            },
            'unexpected',
          ],
          traceContext: null,
        },
      ],
    );
    const excessArgument = await Effect.runPromise(
      decodeRpc(excessArgumentEnvelope.result).pipe(Effect.either),
    );

    // Step 4: Strict object validation rejects undeclared properties too.
    const excessPropertyEnvelope = await Reflect.apply(
      api.executeServiceQuery,
      api,
      [
        {
          args: [
            {
              serviceName: 'products',
              queryName: 'list',
              params: null,
              unexpected: true,
            },
          ],
          traceContext: null,
        },
      ],
    );
    const excessProperty = await Effect.runPromise(
      decodeRpc(excessPropertyEnvelope.result).pipe(Effect.either),
    );

    expect(Either.isLeft(invalidEmptyTuple)).toBe(true);
    if (Either.isLeft(invalidEmptyTuple)) {
      expect(invalidEmptyTuple.left.code).toBe('system-api-arguments-invalid');
    }
    expect(invalidEmptyTupleEnvelope.link).toBe(null);
    expect(Either.isLeft(missingArgument)).toBe(true);
    if (Either.isLeft(missingArgument)) {
      expect(missingArgument.left.code).toBe('system-api-arguments-invalid');
    }
    expect(missingArgumentEnvelope.link).toBe(null);
    expect(Either.isLeft(excessArgument)).toBe(true);
    if (Either.isLeft(excessArgument)) {
      expect(excessArgument.left.code).toBe('system-api-arguments-invalid');
    }
    expect(excessArgumentEnvelope.link).toBe(null);
    expect(Either.isLeft(excessProperty)).toBe(true);
    if (Either.isLeft(excessProperty)) {
      expect(excessProperty.left.code).toBe('system-api-arguments-invalid');
    }
    expect(excessPropertyEnvelope.link).toBe(null);
    expect(getSystemWorker).not.toHaveBeenCalled();
  });

  it('uses a fresh same-call disposable stub, persists a completed root, and links only caller-owned context', async () => {
    const firstDispose = vi.fn();
    const firstGetAggregateFrontendState = vi.fn(async () =>
      encodeRight({
        aggregateId: 'acct_1',
        userId: 'user_1',
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        aggregateName: 'main',
        frontendName: 'dashboard',
        frontendIndex: 3,
        pushedCommands: [],
        resources: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
      }),
    );
    const firstAppendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        const rootSpan = props.batch.spans.at(-1);

        // Step 1: append sees the completed root, not an in-flight collector.
        expect(rootSpan).toMatchObject({
          name: 'SystemApi.getAggregateFrontendState',
          parentSpanId: null,
          status: 'ok',
          attributes: { systemId: 'sys_1' },
        });
        expect(rootSpan?.endedAt).toBeGreaterThanOrEqual(
          rootSpan?.startedAt ?? Number.POSITIVE_INFINITY,
        );
        return encodeRight(undefined);
      },
    );
    const firstSystemWorker = {
      getAggregateFrontendState: firstGetAggregateFrontendState,
      appendTelemetryBatch: firstAppendTelemetryBatch,
      [Symbol.dispose]: firstDispose,
    };

    const secondDispose = vi.fn();
    const secondHello = vi.fn(async () => encodeRight('second-worker'));
    const secondAppendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'SystemApi.hello',
          parentSpanId: null,
          status: 'ok',
          attributes: { systemId: 'sys_1' },
        });
        return encodeRight(undefined);
      },
    );
    const secondSystemWorker = {
      hello: secondHello,
      appendTelemetryBatch: secondAppendTelemetryBatch,
      [Symbol.dispose]: secondDispose,
    };

    getSystemWorker
      .mockReturnValueOnce(firstSystemWorker)
      .mockReturnValueOnce(secondSystemWorker);
    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    // Step 2: The first valid call resolves, invokes, and persists through one stub.
    const firstEnvelope = await api.getAggregateFrontendState({
      args: [
        {
          actorRef,
          frontendName: 'dashboard',
          aggregateFrontendLock,
        },
      ],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_frontend_state',
      },
    });
    const firstResult = await Effect.runPromise(
      decodeRpc(firstEnvelope.result),
    );

    // Step 3: The second valid call resolves a different stub and has no caller link.
    const secondEnvelope = await api.hello({
      args: [],
      traceContext: null,
    });
    const secondResult = await Effect.runPromise(
      decodeRpc(secondEnvelope.result),
    );

    const persistedFirstBatch =
      firstAppendTelemetryBatch.mock.calls[0]?.[0].batch;
    const persistedFirstRoot = persistedFirstBatch?.spans.at(-1);

    expect(firstResult).toEqual({
      aggregateId: 'acct_1',
      userId: 'user_1',
      systemId: 'sys_1',
      systemVersion: '1.0.0',
      aggregateName: 'main',
      frontendName: 'dashboard',
      frontendIndex: 3,
      pushedCommands: [],
      resources: [],
      executedPushedCommands: [],
      failedPushedCommands: [],
    });
    expect(secondResult).toBe('second-worker');
    expect(firstGetAggregateFrontendState).toHaveBeenCalledWith({
      actorRef,
      frontendName: 'dashboard',
      aggregateFrontendLock,
      generationId: 'gen_test',
    });
    expect(firstAppendTelemetryBatch).toHaveBeenCalledTimes(1);
    expect(secondHello).toHaveBeenCalledTimes(1);
    expect(secondAppendTelemetryBatch).toHaveBeenCalledTimes(1);
    expect(firstEnvelope.link).toMatchObject({
      traceId: persistedFirstRoot?.traceId,
      spanId: persistedFirstRoot?.spanId,
      priorTraceId: 'trc_admin',
      priorSpanId: 'spn_admin_frontend_state',
      kind: 'causedBy',
    });
    expect(firstEnvelope.link?.traceId).toMatch(/^trc_/);
    expect(firstEnvelope.link?.spanId).toMatch(/^spn_/);
    expect(secondEnvelope.link).toBe(null);
    expect(getSystemWorker).toHaveBeenNthCalledWith(1, {
      systemWorkerName: 'sys_1:dev:user_1',
    });
    expect(getSystemWorker).toHaveBeenNthCalledWith(2, {
      systemWorkerName: 'sys_1:dev:user_1',
    });
    expect(firstSystemWorker).not.toBe(secondSystemWorker);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps read persistence while routing mutation through SystemRepo without lifecycle identity', async () => {
    const readFailure = new ZerospinError({
      code: 'service-query-failed',
      message: 'The service query failed',
    });
    const mutationFailure = new ZerospinError({
      code: 'service-finalization-failed',
      message: 'The service command could not be finalized',
    });
    const repoFailure = new ZerospinError({
      code: 'repo-list-failed',
      message: 'The repositories could not be listed',
    });

    const readSuccessDispose = vi.fn();
    const readSuccessAppend = vi.fn(async () => encodeRight(undefined));
    getSystemWorker.mockReturnValueOnce({
      executeServiceQuery: vi.fn(async () =>
        encodeRight([{ id: 'product_1', name: 'Desk' }]),
      ),
      appendTelemetryBatch: readSuccessAppend,
      [Symbol.dispose]: readSuccessDispose,
    });

    const readFailureDispose = vi.fn();
    const readFailureAppend = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'SystemApi.executeServiceQuery',
          parentSpanId: null,
          status: 'error',
        });
        return encodeRight(undefined);
      },
    );
    getSystemWorker.mockReturnValueOnce({
      executeServiceQuery: vi.fn(async () => encodeLeft(readFailure)),
      appendTelemetryBatch: readFailureAppend,
      [Symbol.dispose]: readFailureDispose,
    });

    const mutationSuccessDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      [Symbol.dispose]: mutationSuccessDispose,
    });
    const finalizeServiceCommandsSuccess = vi.fn(async () =>
      encodeRight({
        executedCommands: [],
        failedCommands: [],
      }),
    );
    getSystemRepo.mockReturnValueOnce({
      finalizeServiceCommands: finalizeServiceCommandsSuccess,
    });

    const mutationFailureDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      [Symbol.dispose]: mutationFailureDispose,
    });
    const finalizeServiceCommandsFailure = vi.fn(async () =>
      encodeLeft(mutationFailure),
    );
    getSystemRepo.mockReturnValueOnce({
      finalizeServiceCommands: finalizeServiceCommandsFailure,
    });

    const repoSuccessDispose = vi.fn();
    const repoSuccessAppend = vi.fn(async () => encodeRight(undefined));
    getSystemWorker.mockReturnValueOnce({
      getSystemRepos: vi.fn(async () =>
        encodeRight([
          {
            generationId: 'gen_1',
            repoType: 'SystemRepo',
            repoName: 'sys_1:dev:user_1',
            tableNames: ['repoRegistrations'],
          },
        ]),
      ),
      appendTelemetryBatch: repoSuccessAppend,
      [Symbol.dispose]: repoSuccessDispose,
    });

    const repoFailureDispose = vi.fn();
    const repoFailureAppend = vi.fn(async () => encodeRight(undefined));
    getSystemWorker.mockReturnValueOnce({
      getSystemRepos: vi.fn(async () => encodeLeft(repoFailure)),
      appendTelemetryBatch: repoFailureAppend,
      [Symbol.dispose]: repoFailureDispose,
    });

    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const readSuccessEnvelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'products',
          queryName: 'list',
          params: { active: true },
        },
      ],
      traceContext: null,
    });
    const readFailureEnvelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'products',
          queryName: 'list',
          params: { active: false },
        },
      ],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_failed_read',
      },
    });
    const encodedServiceCommand = {
      id: 'cmd_service_1',
      commandName: 'createProduct',
      payload: '{"name":"Desk"}',
      contractVersion: '1',
      commandType: 'service',
      serviceName: 'products',
    } satisfies IEncodedCommand<IServiceCommand>;
    const mutationSuccessEnvelope = await api.finalizeServiceCommands({
      args: [{ serviceName: 'products', commands: [encodedServiceCommand] }],
      traceContext: null,
    });
    const mutationFailureEnvelope = await api.finalizeServiceCommands({
      args: [{ serviceName: 'products', commands: [encodedServiceCommand] }],
      traceContext: null,
    });
    const repoSuccessEnvelope = await api.getSystemRepos({
      args: [],
      traceContext: null,
    });
    const repoFailureEnvelope = await api.getSystemRepos({
      args: [],
      traceContext: null,
    });

    const readFailureResult = await Effect.runPromise(
      decodeRpc(readFailureEnvelope.result).pipe(Effect.either),
    );
    const mutationFailureResult = await Effect.runPromise(
      decodeRpc(mutationFailureEnvelope.result).pipe(Effect.either),
    );
    const repoFailureResult = await Effect.runPromise(
      decodeRpc(repoFailureEnvelope.result).pipe(Effect.either),
    );

    expect(
      await Effect.runPromise(decodeRpc(readSuccessEnvelope.result)),
    ).toEqual([{ id: 'product_1', name: 'Desk' }]);
    expect(Either.isLeft(readFailureResult)).toBe(true);
    if (Either.isLeft(readFailureResult)) {
      expect(readFailureResult.left.code).toBe('service-query-failed');
    }
    expect(readFailureEnvelope.link).toMatchObject({
      priorTraceId: 'trc_admin',
      priorSpanId: 'spn_admin_failed_read',
      kind: 'causedBy',
    });
    expect(
      await Effect.runPromise(decodeRpc(mutationSuccessEnvelope.result)),
    ).toEqual({ executedCommands: [], failedCommands: [] });
    expect(Either.isLeft(mutationFailureResult)).toBe(true);
    if (Either.isLeft(mutationFailureResult)) {
      expect(mutationFailureResult.left.code).toBe(
        'service-finalization-failed',
      );
    }
    expect(mutationSuccessEnvelope.link).toBe(null);
    expect(mutationFailureEnvelope.link).toBe(null);
    expect(getSystemRepo).toHaveBeenCalledTimes(2);
    expect(getSystemRepo).toHaveBeenCalledWith({ systemId: 'sys_1' });
    expect(finalizeServiceCommandsSuccess).toHaveBeenCalledWith({
      serviceName: 'products',
      commands: [encodedServiceCommand],
    });
    expect(finalizeServiceCommandsFailure).toHaveBeenCalledWith({
      serviceName: 'products',
      commands: [encodedServiceCommand],
    });
    expect(
      await Effect.runPromise(decodeRpc(repoSuccessEnvelope.result)),
    ).toEqual([
      {
        generationId: 'gen_1',
        repoType: 'SystemRepo',
        repoName: 'sys_1:dev:user_1',
        tableNames: ['repoRegistrations'],
      },
    ]);
    expect(Either.isLeft(repoFailureResult)).toBe(true);
    if (Either.isLeft(repoFailureResult)) {
      expect(repoFailureResult.left.code).toBe('repo-list-failed');
    }
    expect(readSuccessAppend).toHaveBeenCalledTimes(1);
    expect(readFailureAppend).toHaveBeenCalledTimes(1);
    expect(repoSuccessAppend).toHaveBeenCalledTimes(1);
    expect(repoFailureAppend).toHaveBeenCalledTimes(1);
    expect(readSuccessDispose).toHaveBeenCalledTimes(1);
    expect(readFailureDispose).toHaveBeenCalledTimes(1);
    expect(mutationSuccessDispose).toHaveBeenCalledTimes(1);
    expect(mutationFailureDispose).toHaveBeenCalledTimes(1);
    expect(repoSuccessDispose).toHaveBeenCalledTimes(1);
    expect(repoFailureDispose).toHaveBeenCalledTimes(1);
  });

  it('preserves the leaf result and disposes the stub after rejected and encoded telemetry persistence failures', async () => {
    const rejectedPersistenceDispose = vi.fn();
    const rejectedPersistenceAppend = vi.fn(async () => {
      throw new Error('telemetry sink unavailable');
    });
    getSystemWorker.mockReturnValueOnce({
      executeServiceQuery: vi.fn(async () => encodeRight('rejection-kept')),
      appendTelemetryBatch: rejectedPersistenceAppend,
      [Symbol.dispose]: rejectedPersistenceDispose,
    });

    const persistenceError = new ZerospinError({
      code: 'telemetry-persistence-failed',
      message: 'The telemetry sink rejected the batch',
    });
    const encodedPersistenceDispose = vi.fn();
    const encodedPersistenceAppend = vi.fn(async () =>
      encodeLeft(persistenceError),
    );
    getSystemWorker.mockReturnValueOnce({
      executeServiceQuery: vi.fn(async () =>
        encodeRight('encoded-failure-kept'),
      ),
      appendTelemetryBatch: encodedPersistenceAppend,
      [Symbol.dispose]: encodedPersistenceDispose,
    });

    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const rejectedPersistenceEnvelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'products',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_rejected_persistence',
      },
    });
    const encodedPersistenceEnvelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'products',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_encoded_persistence',
      },
    });

    expect(
      await Effect.runPromise(decodeRpc(rejectedPersistenceEnvelope.result)),
    ).toBe('rejection-kept');
    expect(rejectedPersistenceEnvelope.link).toBe(null);
    expect(rejectedPersistenceAppend).toHaveBeenCalledTimes(1);
    expect(rejectedPersistenceDispose).toHaveBeenCalledTimes(1);
    expect(
      await Effect.runPromise(decodeRpc(encodedPersistenceEnvelope.result)),
    ).toBe('encoded-failure-kept');
    expect(encodedPersistenceEnvelope.link).toBe(null);
    expect(encodedPersistenceAppend).toHaveBeenCalledTimes(1);
    expect(encodedPersistenceDispose).toHaveBeenCalledTimes(1);
  });

  it('encodes a rejected leaf call, persists its failed root, and disposes the acquired stub', async () => {
    const dispose = vi.fn();
    const hello = vi.fn(async () => {
      throw new Error('SystemWorker hello rejected');
    });
    const appendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'SystemApi.hello',
          parentSpanId: null,
          status: 'error',
        });
        return encodeRight(undefined);
      },
    );
    getSystemWorker.mockReturnValue({
      hello,
      appendTelemetryBatch,
      [Symbol.dispose]: dispose,
    });
    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const envelope = await api.hello({
      args: [],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_hello',
      },
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('async-failed');
      expect(result.left.message).toContain('SystemWorker hello rejected');
    }
    expect(envelope.link).toMatchObject({
      priorTraceId: 'trc_admin',
      priorSpanId: 'spn_admin_hello',
      kind: 'causedBy',
    });
    expect(hello).toHaveBeenCalledTimes(1);
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('preserves complete aggregate commands and every finalized aggregate result invariant', async () => {
    const executedCommand = {
      id: 'cmd_executed',
      commandName: 'createProduct',
      payload: '{"name":"Desk"}',
      contractVersion: '1.0.0',
      commandType: 'aggregate',
      aggregateId: 'acct_1',
      aggregateName: 'main',
      systemName: 'shopping',
      sessionId: 'sesn_executed',
      userId: 'user_1',
      frontendName: 'dashboard',
      pushedCursor: 'pcur_executed',
      mode: 'authoritative',
      aggregateCursor: 'acur_executed',
      aggregateIndex: 41,
      executedAt: new Date('2026-07-12T12:00:00.000Z'),
      status: 'executed',
    };
    const failedCommand = {
      id: 'cmd_failed',
      commandName: 'updateProduct',
      payload: '{"name":"Missing"}',
      contractVersion: '1.0.0',
      commandType: 'aggregate',
      aggregateId: 'acct_1',
      aggregateName: 'main',
      systemName: 'shopping',
      sessionId: 'sesn_failed',
      userId: 'user_1',
      frontendName: 'dashboard',
      pushedCursor: 'pcur_failed',
      aggregateCursor: 'acur_failed',
      aggregateIndex: 42,
      failedAt: new Date('2026-07-12T12:00:01.000Z'),
      failure: 'Product not found',
      status: 'failed',
    };
    const appliedMutation = {
      commandId: 'cmd_executed',
      mutationIndex: 0,
      modelName: 'product',
      resourceId: 'prod_1',
      operationName: 'create',
      operation: '{"encodedAttributes":{"name":"Desk"}}',
      appliedAt: new Date('2026-07-12T12:00:00.000Z'),
      lastAppliedAt: null,
      inverseOperation: 'null',
    };
    const finalizeAggregateCommands = vi.fn(async () =>
      encodeRight({
        executedCommands: [executedCommand],
        failedCommands: [failedCommand],
        appliedMutations: [appliedMutation],
        lastAggregateCursor: 'acur_failed',
        aggregateIndex: 42,
      }),
    );
    getSystemRepo.mockReturnValue({ finalizeAggregateCommands });
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      [Symbol.dispose]: dispose,
    });
    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const envelope = await api.finalizeAggregateCommands({
      args: [
        {
          aggregateId: 'acct_1',
          aggregateName: 'main',
          commands: [
            {
              id: 'cmd_input',
              commandName: 'createProduct',
              payload: '{"name":"Desk"}',
              contractVersion: '1.0.0',
              commandType: 'aggregate',
              aggregateId: 'acct_1',
              aggregateName: 'main',
              systemName: 'shopping',
              sessionId: 'sesn_input',
              userId: 'user_1',
              frontendName: 'dashboard',
              pushedCursor: 'pcur_input',
            },
          ],
        },
      ],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_finalize',
      },
    });
    const result = await Effect.runPromise(decodeRpc(envelope.result));

    // Step 1: The complete command crosses the current-write gateway unchanged.
    expect(getSystemRepo).toHaveBeenCalledWith({ systemId: 'sys_1' });
    expect(finalizeAggregateCommands).toHaveBeenCalledTimes(1);
    expect(finalizeAggregateCommands).toHaveBeenCalledWith({
      aggregateId: 'acct_1',
      aggregateName: 'main',
      commands: [
        {
          id: 'cmd_input',
          commandName: 'createProduct',
          payload: '{"name":"Desk"}',
          contractVersion: '1.0.0',
          commandType: 'aggregate',
          aggregateId: 'acct_1',
          aggregateName: 'main',
          systemName: 'shopping',
          sessionId: 'sesn_input',
          userId: 'user_1',
          frontendName: 'dashboard',
          pushedCursor: 'pcur_input',
        },
      ],
    });

    // Step 2: The public result keeps full command provenance and ledger data.
    expect(result.executedCommands).toEqual([executedCommand]);
    expect(result.failedCommands).toEqual([failedCommand]);
    expect(result.appliedMutations).toEqual([appliedMutation]);
    expect(result.lastAggregateCursor).toBe('acur_failed');
    expect(result.aggregateIndex).toBe(42);
    // Step 3: Internal outbox state never rewrites the retained caller result.
    expect(result).not.toHaveProperty('pushedBlockId');
    expect(result).not.toHaveProperty('failure');
    expect(result).not.toHaveProperty('publishedAt');
    expect(envelope.link).toBe(null);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps hello, frontend state, service query, and system spec as one-shot leaves', async () => {
    const transientMessage =
      'Durable Object reset because its code was updated';

    const hello = vi.fn(async () => {
      throw new Error(transientMessage);
    });
    const helloDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      hello,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: helloDispose,
    });

    const getAggregateFrontendState = vi.fn(async () => {
      throw new Error(transientMessage);
    });
    const frontendStateDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      getAggregateFrontendState,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: frontendStateDispose,
    });

    const executeServiceQuery = vi.fn(async () => {
      throw new Error(transientMessage);
    });
    const serviceQueryDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      executeServiceQuery,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: serviceQueryDispose,
    });

    const getSystemSpec = vi.fn(async () => {
      throw new Error(transientMessage);
    });
    const systemSpecDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      getSystemSpec,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: systemSpecDispose,
    });

    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const helloEnvelope = await api.hello({ args: [], traceContext: null });
    const frontendStateEnvelope = await api.getAggregateFrontendState({
      args: [
        {
          actorRef,
          frontendName: 'dashboard',
          aggregateFrontendLock,
        },
      ],
      traceContext: null,
    });
    const serviceQueryEnvelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'products',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: null,
    });
    const systemSpecEnvelope = await api.makeSystemSpec({
      args: [],
      traceContext: null,
    });

    const helloResult = await Effect.runPromise(
      decodeRpc(helloEnvelope.result).pipe(Effect.either),
    );
    const frontendStateResult = await Effect.runPromise(
      decodeRpc(frontendStateEnvelope.result).pipe(Effect.either),
    );
    const serviceQueryResult = await Effect.runPromise(
      decodeRpc(serviceQueryEnvelope.result).pipe(Effect.either),
    );
    const systemSpecResult = await Effect.runPromise(
      decodeRpc(systemSpecEnvelope.result).pipe(Effect.either),
    );

    expect(Either.isLeft(helloResult)).toBe(true);
    expect(Either.isLeft(frontendStateResult)).toBe(true);
    expect(Either.isLeft(serviceQueryResult)).toBe(true);
    expect(Either.isLeft(systemSpecResult)).toBe(true);
    expect(hello).toHaveBeenCalledTimes(1);
    expect(getAggregateFrontendState).toHaveBeenCalledTimes(1);
    expect(executeServiceQuery).toHaveBeenCalledTimes(1);
    expect(getSystemSpec).toHaveBeenCalledTimes(1);
    expect(getSystemSpec).toHaveBeenCalledWith();
    expect(getSystemWorker).toHaveBeenCalledTimes(4);
    expect(helloDispose).toHaveBeenCalledTimes(1);
    expect(frontendStateDispose).toHaveBeenCalledTimes(1);
    expect(serviceQueryDispose).toHaveBeenCalledTimes(1);
    expect(systemSpecDispose).toHaveBeenCalledTimes(1);
  });

  it('calls each leaf once without replaying transient-looking failures', async () => {
    const transientError = new ZerospinError({
      code: 'durable-object-reset',
      message: 'Durable Object reset because its code was updated',
    });

    // Step 1: Aggregate finalization returns its first decoded RPC failure.
    const finalizeAggregateCommands = vi.fn(async () =>
      encodeLeft(transientError),
    );
    getSystemRepo.mockReturnValueOnce({ finalizeAggregateCommands });
    const finalizeDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      [Symbol.dispose]: finalizeDispose,
    });

    // Step 2: A rejected select RPC is not replayed before decodeRpc.
    const executeSelectQuery = vi
      .fn()
      .mockRejectedValue(
        new Error('Durable Object reset because its code was updated'),
      );
    const selectDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      executeSelectQuery,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: selectDispose,
    });

    // Step 3: Service finalization returns its first encoded failure.
    const finalizeServiceCommands = vi.fn(async () =>
      encodeLeft(transientError),
    );
    getSystemRepo.mockReturnValueOnce({ finalizeServiceCommands });
    const serviceFinalizeDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      [Symbol.dispose]: serviceFinalizeDispose,
    });

    // Step 4: RepoExplorer leaves also make one attempt.
    const getSystemRepos = vi
      .fn()
      .mockRejectedValue(new Error('Durable Object Namespace was deleted'));
    const repoListDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      getSystemRepos,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: repoListDispose,
    });

    const getSystemRepoTableRows = vi
      .fn()
      .mockRejectedValue(new Error('Durable Object Namespace was deleted'));
    const repoRowsDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      getSystemRepoTableRows,
      appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
      [Symbol.dispose]: repoRowsDispose,
    });

    const api = new SystemApi({
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const finalizeEnvelope = await api.finalizeAggregateCommands({
      args: [
        {
          aggregateId: 'acct_1',
          aggregateName: 'main',
          commands: [],
        },
      ],
      traceContext: null,
    });
    const selectEnvelope = await api.executeSelectQuery({
      args: [
        {
          aggregateId: 'acct_1',
          aggregateName: 'main',
          query: {
            method: 'all',
            params: [],
            rawSql: 'select 1',
          },
        },
      ],
      traceContext: null,
    });
    const serviceFinalizeEnvelope = await api.finalizeServiceCommands({
      args: [{ serviceName: 'products', commands: [] }],
      traceContext: null,
    });
    const repoListEnvelope = await api.getSystemRepos({
      args: [],
      traceContext: null,
    });
    const repoRowsEnvelope = await api.getSystemRepoTableRows({
      args: [{ repoName: 'sys_1:dev:user_1', tableName: 'rows' }],
      traceContext: null,
    });
    const results = await Promise.all(
      [
        finalizeEnvelope,
        selectEnvelope,
        serviceFinalizeEnvelope,
        repoListEnvelope,
        repoRowsEnvelope,
      ].map(envelope =>
        Effect.runPromise(decodeRpc(envelope.result).pipe(Effect.either)),
      ),
    );
    expect(results.every(Either.isLeft)).toBe(true);
    expect(finalizeAggregateCommands).toHaveBeenCalledTimes(1);
    expect(executeSelectQuery).toHaveBeenCalledTimes(1);
    expect(finalizeServiceCommands).toHaveBeenCalledTimes(1);
    expect(getSystemRepos).toHaveBeenCalledTimes(1);
    expect(getSystemRepoTableRows).toHaveBeenCalledTimes(1);

    // Step 5: Every one-shot invocation still disposes its resolved stub.
    expect(getSystemWorker).toHaveBeenCalledTimes(5);
    expect(finalizeDispose).toHaveBeenCalledTimes(1);
    expect(selectDispose).toHaveBeenCalledTimes(1);
    expect(serviceFinalizeDispose).toHaveBeenCalledTimes(1);
    expect(repoListDispose).toHaveBeenCalledTimes(1);
    expect(repoRowsDispose).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('returns the captured encoded error and null link from all twenty-seven SystemApiFailure leaves without resolver or append work', async () => {
    const capturedError = new ZerospinError({
      code: 'system-authentication-failed',
      message: 'The SystemApi capability could not be authenticated',
    });
    const encodedError = encodeLeft(capturedError);
    const appendTelemetryBatch = vi.fn(async () => encodeRight(undefined));
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      appendTelemetryBatch,
      [Symbol.dispose]: dispose,
    });
    const api = new SystemApiFailure(capturedError);

    const emptyRequest = {
      args: [],
      traceContext: null,
    } satisfies Parameters<SystemApi['hello']>[0];
    const repoTableRequest = {
      args: [{ repoName: 'repo', tableName: 'rows' }],
      traceContext: null,
    } satisfies Parameters<SystemApi['getSystemRepoTableRows']>[0];

    // Step 1: Exercise the root greeting and all four non-RepoExplorer domains.
    const hello = await api.hello(emptyRequest);
    const getAggregateFrontendState = await api.getAggregateFrontendState({
      args: [
        {
          actorRef,
          frontendName: 'dashboard',
          aggregateFrontendLock,
        },
      ],
      traceContext: null,
    });
    const executeServiceQuery = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'products',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: null,
    });
    const finalizeAggregateCommands = await api.finalizeAggregateCommands({
      args: [
        {
          aggregateId: 'acct_1',
          aggregateName: 'main',
          commands: [],
        },
      ],
      traceContext: null,
    });
    const executeSelectQuery = await api.executeSelectQuery({
      args: [
        {
          aggregateId: 'acct_1',
          aggregateName: 'main',
          query: {
            method: 'all',
            params: [],
            rawSql: 'select 1',
          },
        },
      ],
      traceContext: null,
    });
    const finalizeServiceCommands = await api.finalizeServiceCommands({
      args: [{ serviceName: 'products', commands: [] }],
      traceContext: null,
    });

    // Step 2: Exercise every repository-list leaf explicitly.
    const getSystemRepos = await api.getSystemRepos(emptyRequest);
    const getAggregateRepos = await api.getAggregateRepos(emptyRequest);
    const getAggregateFrontendRepos =
      await api.getAggregateFrontendRepos(emptyRequest);
    const getServiceFrontendRepos =
      await api.getServiceFrontendRepos(emptyRequest);
    const getServiceRepos = await api.getServiceRepos(emptyRequest);
    const getAggregateBlockRepos =
      await api.getAggregateBlockRepos(emptyRequest);
    const getAggregateFrontendBlockRepos =
      await api.getAggregateFrontendBlockRepos(emptyRequest);
    const getServiceFrontendBlockRepos =
      await api.getServiceFrontendBlockRepos(emptyRequest);
    const getServiceBlockRepos = await api.getServiceBlockRepos(emptyRequest);
    const getSystemLogRepos = await api.getSystemLogRepos(emptyRequest);

    // Step 3: Exercise every repository-table leaf explicitly.
    const getSystemRepoTableRows =
      await api.getSystemRepoTableRows(repoTableRequest);
    const getAggregateRepoTableRows =
      await api.getAggregateRepoTableRows(repoTableRequest);
    const getAggregateFrontendRepoTableRows =
      await api.getAggregateFrontendRepoTableRows(repoTableRequest);
    const getServiceFrontendRepoTableRows =
      await api.getServiceFrontendRepoTableRows(repoTableRequest);
    const getServiceRepoTableRows =
      await api.getServiceRepoTableRows(repoTableRequest);
    const getAggregateBlockRepoTableRows =
      await api.getAggregateBlockRepoTableRows(repoTableRequest);
    const getAggregateFrontendBlockRepoTableRows =
      await api.getAggregateFrontendBlockRepoTableRows(repoTableRequest);
    const getServiceFrontendBlockRepoTableRows =
      await api.getServiceFrontendBlockRepoTableRows(repoTableRequest);
    const getServiceBlockRepoTableRows =
      await api.getServiceBlockRepoTableRows(repoTableRequest);
    const getSystemLogRepoTableRows =
      await api.getSystemLogRepoTableRows(repoTableRequest);

    // Step 4: Exercise the final system-spec leaf explicitly.
    const makeSystemSpec = await api.makeSystemSpec(emptyRequest);

    expect(hello).toEqual({ result: encodedError, link: null });
    expect(getAggregateFrontendState).toEqual({
      result: encodedError,
      link: null,
    });
    expect(executeServiceQuery).toEqual({ result: encodedError, link: null });
    expect(finalizeAggregateCommands).toEqual({
      result: encodedError,
      link: null,
    });
    expect(executeSelectQuery).toEqual({ result: encodedError, link: null });
    expect(finalizeServiceCommands).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getSystemRepos).toEqual({ result: encodedError, link: null });
    expect(getSystemRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateRepos).toEqual({ result: encodedError, link: null });
    expect(getAggregateRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateFrontendRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateFrontendRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceFrontendRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceFrontendRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceRepos).toEqual({ result: encodedError, link: null });
    expect(getServiceRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateBlockRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateBlockRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateFrontendBlockRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceFrontendBlockRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceFrontendBlockRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAggregateFrontendBlockRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceBlockRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceBlockRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getSystemLogRepos).toEqual({ result: encodedError, link: null });
    expect(getSystemLogRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(makeSystemSpec).toEqual({ result: encodedError, link: null });

    // Step 5: The failure capability never enters leaf execution machinery.
    expect(getSystemWorker).not.toHaveBeenCalled();
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
  });
});
