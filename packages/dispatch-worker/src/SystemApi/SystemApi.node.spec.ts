import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { emptyTelemetryBatch, type ITelemetryBatch } from '@zerospin/logger';
import { Effect, Either, Layer } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import { makeDispatchRuntime } from '../makeDispatchRuntime';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';

import { SystemApi } from './SystemApi';
import { SystemApiFailure } from './SystemApiFailure';

const getSystemWorker = vi.fn();
const runtime = makeDispatchRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
  apiKeyIdentityResolver: Layer.succeed(ApiKeyIdentityResolver, {
    resolve: () => Effect.dieMessage('SystemApi leaf tests do not resolve API keys'),
  }),
});

describe('SystemApi', () => {
  beforeEach(() => {
    getSystemWorker.mockReset();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('strictly rejects malformed empty and one-argument tuples before resolving a SystemWorker', async () => {
    const api = new SystemApi({
      deployId: 'dpl_test',
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
    const firstGetFrontendState = vi.fn(async () =>
      encodeRight({
        actorId: 'actr_1',
        systemWorkerName: 'sys_1:dev:user_1',
        accountName: 'main',
        actorName: 'admin',
        frontendName: 'dashboard',
        frontendIndex: 3,
        lastRebasedPushedCursor: null,
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
          name: 'SystemApi.getFrontendState',
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
      getFrontendState: firstGetFrontendState,
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
      deployId: 'dpl_test',
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    // Step 2: The first valid call resolves, invokes, and persists through one stub.
    const firstEnvelope = await api.getFrontendState({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          actorId: 'actr_1',
          actorName: 'admin',
          frontendName: 'dashboard',
        },
      ],
      traceContext: {
        traceId: 'trc_admin',
        parentSpanId: 'spn_admin_frontend_state',
      },
    });
    const firstResult = await Effect.runPromise(decodeRpc(firstEnvelope.result));

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
      actorId: 'actr_1',
      systemWorkerName: 'sys_1:dev:user_1',
      accountName: 'main',
      actorName: 'admin',
      frontendName: 'dashboard',
      frontendIndex: 3,
      lastRebasedPushedCursor: null,
      pushedCommands: [],
      resources: [],
      executedPushedCommands: [],
      failedPushedCommands: [],
    });
    expect(secondResult).toBe('second-worker');
    expect(firstGetFrontendState).toHaveBeenCalledWith({
      accountId: 'acct_1',
      accountName: 'main',
      actorId: 'actr_1',
      actorName: 'admin',
      deployId: 'dpl_test',
      frontendName: 'dashboard',
      generationId: 'gen_test',
      systemWorkerName: 'sys_1:dev:user_1',
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

  it('encodes representative read, mutation, and RepoExplorer success and domain failure without skipping persistence', async () => {
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
    const mutationSuccessAppend = vi.fn(async () => encodeRight(undefined));
    getSystemWorker.mockReturnValueOnce({
      finalizeServiceCommands: vi.fn(async () =>
        encodeRight({
          executedCommands: [],
          failedCommands: [],
        }),
      ),
      appendTelemetryBatch: mutationSuccessAppend,
      [Symbol.dispose]: mutationSuccessDispose,
    });

    const mutationFailureDispose = vi.fn();
    const mutationFailureAppend = vi.fn(async () => encodeRight(undefined));
    getSystemWorker.mockReturnValueOnce({
      finalizeServiceCommands: vi.fn(async () => encodeLeft(mutationFailure)),
      appendTelemetryBatch: mutationFailureAppend,
      [Symbol.dispose]: mutationFailureDispose,
    });

    const repoSuccessDispose = vi.fn();
    const repoSuccessAppend = vi.fn(async () => encodeRight(undefined));
    getSystemWorker.mockReturnValueOnce({
      getSystemRepos: vi.fn(async () =>
        encodeRight([
          {
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
      deployId: 'dpl_test',
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
    const mutationSuccessEnvelope = await api.finalizeServiceCommands({
      args: [{ serviceName: 'products', commands: [] }],
      traceContext: null,
    });
    const mutationFailureEnvelope = await api.finalizeServiceCommands({
      args: [{ serviceName: 'products', commands: [] }],
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

    expect(await Effect.runPromise(decodeRpc(readSuccessEnvelope.result))).toEqual(
      [{ id: 'product_1', name: 'Desk' }],
    );
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
    ).toEqual({ executed: [], failed: [] });
    expect(Either.isLeft(mutationFailureResult)).toBe(true);
    if (Either.isLeft(mutationFailureResult)) {
      expect(mutationFailureResult.left.code).toBe(
        'service-finalization-failed',
      );
    }
    expect(
      await Effect.runPromise(decodeRpc(repoSuccessEnvelope.result)),
    ).toEqual([
      {
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
    expect(mutationSuccessAppend).toHaveBeenCalledTimes(1);
    expect(mutationFailureAppend).toHaveBeenCalledTimes(1);
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
      deployId: 'dpl_test',
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
      deployId: 'dpl_test',
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

  it('preserves complete account commands and every finalized account result invariant', async () => {
    const executedCommand = {
      id: 'cmd_executed',
      commandName: 'createProduct',
      payload: '{"name":"Desk"}',
      version: '1.0.0',
      commandType: 'account',
      accountId: 'acct_1',
      accountName: 'main',
      systemName: 'shopping',
      systemVersion: '1.0.0',
      sessionId: 'sesn_executed',
      actorId: 'actr_1',
      actorName: 'admin',
      frontendName: 'dashboard',
      pushedCursor: 'pcur_executed',
      mode: 'authoritative',
      accountCursor: 'acur_executed',
      accountIndex: 41,
      executedAt: new Date('2026-07-12T12:00:00.000Z'),
      status: 'executed',
    };
    const failedCommand = {
      id: 'cmd_failed',
      commandName: 'updateProduct',
      payload: '{"name":"Missing"}',
      version: '1.0.0',
      commandType: 'account',
      accountId: 'acct_1',
      accountName: 'main',
      systemName: 'shopping',
      systemVersion: '1.0.0',
      sessionId: 'sesn_failed',
      actorId: 'actr_1',
      actorName: 'admin',
      frontendName: 'dashboard',
      pushedCursor: 'pcur_failed',
      accountCursor: 'acur_failed',
      accountIndex: 42,
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
    const publicationFailure = new ZerospinError({
      code: 'account-block-publication-failed',
      message: 'The finalized block is waiting for publication',
    });
    const finalizeAccountBlock = vi.fn(async (_request: unknown) => ({
      result: encodeRight({
        pushedBlockId: null,
        executedCommands: [executedCommand],
        failedCommands: [failedCommand],
        appliedMutations: [appliedMutation],
        lastAccountCursor: 'acur_failed',
        accountIndex: 42,
        failure: publicationFailure,
        publishedAt: null,
      }),
      telemetry: emptyTelemetryBatch(),
    }));
    const appendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'SystemApi.finalizeAccountCommands',
          parentSpanId: null,
          status: 'ok',
        });
        return encodeRight(undefined);
      },
    );
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      finalizeAccountBlock,
      appendTelemetryBatch,
      [Symbol.dispose]: dispose,
    });
    const api = new SystemApi({
      deployId: 'dpl_test',
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const envelope = await api.finalizeAccountCommands({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          commands: [
            {
              id: 'cmd_input',
              commandName: 'createProduct',
              payload: '{"name":"Desk"}',
              version: '1.0.0',
              commandType: 'account',
              accountId: 'acct_1',
              accountName: 'main',
              systemName: 'shopping',
              systemVersion: '1.0.0',
              sessionId: 'sesn_input',
              actorId: 'actr_1',
              actorName: 'admin',
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

    // Step 1: The complete incoming command crosses the traced worker boundary.
    expect(finalizeAccountBlock).toHaveBeenCalledTimes(1);
    expect(finalizeAccountBlock.mock.calls[0]?.[0]).toMatchObject({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          deployId: 'dpl_test',
          generationId: 'gen_test',
          commands: [
            {
              id: 'cmd_input',
              commandName: 'createProduct',
              payload: '{"name":"Desk"}',
              version: '1.0.0',
              commandType: 'account',
              accountId: 'acct_1',
              accountName: 'main',
              systemName: 'shopping',
              systemVersion: '1.0.0',
              sessionId: 'sesn_input',
              actorId: 'actr_1',
              actorName: 'admin',
              frontendName: 'dashboard',
              pushedCursor: 'pcur_input',
            },
          ],
        },
      ],
      traceContext: {
        traceId: expect.stringMatching(/^trc_/),
        parentSpanId: expect.stringMatching(/^spn_/),
      },
    });

    // Step 2: The public result keeps full command provenance and ledger data.
    expect(result.executedCommands).toEqual([executedCommand]);
    expect(result.failedCommands).toEqual([failedCommand]);
    expect(result.appliedMutations).toEqual([appliedMutation]);
    expect(result.lastAccountCursor).toBe('acur_failed');
    expect(result.accountIndex).toBe(42);
    expect(result.failure).toMatchObject({
      code: 'account-block-publication-failed',
      message: expect.stringContaining(
        'The finalized block is waiting for publication',
      ),
    });

    // Step 3: Internal outbox fields are checked or intentionally omitted.
    expect(result).not.toHaveProperty('pushedBlockId');
    expect(result).not.toHaveProperty('publishedAt');
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(1);
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

    const getFrontendState = vi.fn(async () => {
      throw new Error(transientMessage);
    });
    const frontendStateDispose = vi.fn();
    getSystemWorker.mockReturnValueOnce({
      getFrontendState,
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
      deployId: 'dpl_test',
      generationId: 'gen_test',
      systemId: 'sys_1',
      systemWorkerName: 'sys_1:dev:user_1',
      runtime,
    });

    const helloEnvelope = await api.hello({ args: [], traceContext: null });
    const frontendStateEnvelope = await api.getFrontendState({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          actorId: 'actr_1',
          actorName: 'admin',
          frontendName: 'dashboard',
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
    expect(getFrontendState).toHaveBeenCalledTimes(1);
    expect(executeServiceQuery).toHaveBeenCalledTimes(1);
    expect(getSystemSpec).toHaveBeenCalledTimes(1);
    expect(getSystemWorker).toHaveBeenCalledTimes(4);
    expect(helloDispose).toHaveBeenCalledTimes(1);
    expect(frontendStateDispose).toHaveBeenCalledTimes(1);
    expect(serviceQueryDispose).toHaveBeenCalledTimes(1);
    expect(systemSpecDispose).toHaveBeenCalledTimes(1);
  });

  it(
    'keeps retry inside each approved leaf and preserves whether decoding is inside that retry scope',
    async () => {
      const transientError = new ZerospinError({
        code: 'durable-object-reset',
        message: 'Durable Object reset because its code was updated',
      });

      // Step 1: Account finalization retries the decoded traced RPC failure.
      const finalizeAccountBlock = vi
        .fn()
        .mockResolvedValueOnce({
          result: encodeLeft(transientError),
          telemetry: emptyTelemetryBatch(),
        })
        .mockResolvedValueOnce({
          result: encodeRight({
            pushedBlockId: null,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
            lastAccountCursor: 'acur_retry',
            accountIndex: 1,
            failure: null,
            publishedAt: null,
          }),
          telemetry: emptyTelemetryBatch(),
        });
      const finalizeDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        finalizeAccountBlock,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: finalizeDispose,
      });

      // Step 2: Select-query retry surrounds the rejected call, before decodeRpc.
      const executeSelectQuery = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Durable Object reset because its code was updated'),
        )
        .mockResolvedValueOnce(encodeRight([{ value: 1 }]));
      const selectDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        executeSelectQuery,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: selectDispose,
      });

      // Step 3: Service finalization retries after decoding its encoded failure.
      const finalizeServiceCommands = vi
        .fn()
        .mockResolvedValueOnce(encodeLeft(transientError))
        .mockResolvedValueOnce(
          encodeRight({ executedCommands: [], failedCommands: [] }),
        );
      const serviceFinalizeDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        finalizeServiceCommands,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: serviceFinalizeDispose,
      });

      // Step 4: Both RepoExplorer shapes retry a rejected call before decoding.
      const getSystemRepos = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Durable Object Namespace was deleted'),
        )
        .mockResolvedValueOnce(encodeRight([]));
      const repoListDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        getSystemRepos,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: repoListDispose,
      });

      const getSystemRepoTableRows = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Durable Object Namespace was deleted'),
        )
        .mockResolvedValueOnce(encodeRight({ columns: [], rows: [] }));
      const repoRowsDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        getSystemRepoTableRows,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: repoRowsDispose,
      });

      // Step 5: Encoded select and RepoExplorer failures are decoded after retry.
      const encodedFailureSelectQuery = vi.fn(async () =>
        encodeLeft(transientError),
      );
      const encodedFailureSelectDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        executeSelectQuery: encodedFailureSelectQuery,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: encodedFailureSelectDispose,
      });

      const encodedFailureGetSystemRepos = vi.fn(async () =>
        encodeLeft(transientError),
      );
      const encodedFailureRepoDispose = vi.fn();
      getSystemWorker.mockReturnValueOnce({
        getSystemRepos: encodedFailureGetSystemRepos,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: encodedFailureRepoDispose,
      });

      const api = new SystemApi({
        deployId: 'dpl_test',
        generationId: 'gen_test',
        systemId: 'sys_1',
        systemWorkerName: 'sys_1:dev:user_1',
        runtime,
      });

      const finalizeEnvelope = await api.finalizeAccountCommands({
        args: [
          {
            accountId: 'acct_1',
            accountName: 'main',
            commands: [],
          },
        ],
        traceContext: null,
      });
      const selectEnvelope = await api.executeSelectQuery({
        args: [
          {
            accountId: 'acct_1',
            accountName: 'main',
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
      const encodedFailureSelectEnvelope = await api.executeSelectQuery({
        args: [
          {
            accountId: 'acct_1',
            accountName: 'main',
            query: {
              method: 'all',
              params: [],
              rawSql: 'select 2',
            },
          },
        ],
        traceContext: null,
      });
      const encodedFailureRepoEnvelope = await api.getSystemRepos({
        args: [],
        traceContext: null,
      });

      const encodedFailureSelectResult = await Effect.runPromise(
        decodeRpc(encodedFailureSelectEnvelope.result).pipe(Effect.either),
      );
      const encodedFailureRepoResult = await Effect.runPromise(
        decodeRpc(encodedFailureRepoEnvelope.result).pipe(Effect.either),
      );

      expect(
        await Effect.runPromise(decodeRpc(finalizeEnvelope.result)),
      ).toMatchObject({ lastAccountCursor: 'acur_retry', accountIndex: 1 });
      expect(await Effect.runPromise(decodeRpc(selectEnvelope.result))).toEqual(
        [{ value: 1 }],
      );
      expect(
        await Effect.runPromise(decodeRpc(serviceFinalizeEnvelope.result)),
      ).toEqual({ executed: [], failed: [] });
      expect(
        await Effect.runPromise(decodeRpc(repoListEnvelope.result)),
      ).toEqual([]);
      expect(
        await Effect.runPromise(decodeRpc(repoRowsEnvelope.result)),
      ).toEqual({ columns: [], rows: [] });
      expect(Either.isLeft(encodedFailureSelectResult)).toBe(true);
      expect(Either.isLeft(encodedFailureRepoResult)).toBe(true);
      expect(finalizeAccountBlock).toHaveBeenCalledTimes(2);
      expect(executeSelectQuery).toHaveBeenCalledTimes(2);
      expect(finalizeServiceCommands).toHaveBeenCalledTimes(2);
      expect(getSystemRepos).toHaveBeenCalledTimes(2);
      expect(getSystemRepoTableRows).toHaveBeenCalledTimes(2);
      expect(encodedFailureSelectQuery).toHaveBeenCalledTimes(1);
      expect(encodedFailureGetSystemRepos).toHaveBeenCalledTimes(1);

      // Step 6: Retry never reacquires a stub and every invocation still disposes.
      expect(getSystemWorker).toHaveBeenCalledTimes(7);
      expect(finalizeDispose).toHaveBeenCalledTimes(1);
      expect(selectDispose).toHaveBeenCalledTimes(1);
      expect(serviceFinalizeDispose).toHaveBeenCalledTimes(1);
      expect(repoListDispose).toHaveBeenCalledTimes(1);
      expect(repoRowsDispose).toHaveBeenCalledTimes(1);
      expect(encodedFailureSelectDispose).toHaveBeenCalledTimes(1);
      expect(encodedFailureRepoDispose).toHaveBeenCalledTimes(1);
    },
    10_000,
  );

  it('returns the captured encoded error and null link from all twenty-nine SystemApiFailure leaves without resolver or append work', async () => {
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
    const getFrontendState = await api.getFrontendState({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          actorId: 'actr_1',
          actorName: 'admin',
          frontendName: 'dashboard',
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
    const finalizeAccountCommands = await api.finalizeAccountCommands({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
          commands: [],
        },
      ],
      traceContext: null,
    });
    const executeSelectQuery = await api.executeSelectQuery({
      args: [
        {
          accountId: 'acct_1',
          accountName: 'main',
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
    const getAccountRepos = await api.getAccountRepos(emptyRequest);
    const getAuthorizationRepos = await api.getAuthorizationRepos(emptyRequest);
    const getActorRepos = await api.getActorRepos(emptyRequest);
    const getFrontendRepos = await api.getFrontendRepos(emptyRequest);
    const getServiceRepos = await api.getServiceRepos(emptyRequest);
    const getAccountBlockRepos = await api.getAccountBlockRepos(emptyRequest);
    const getActorBlockRepos = await api.getActorBlockRepos(emptyRequest);
    const getFrontendBlockRepos =
      await api.getFrontendBlockRepos(emptyRequest);
    const getServiceBlockRepos = await api.getServiceBlockRepos(emptyRequest);
    const getSystemLogRepos = await api.getSystemLogRepos(emptyRequest);

    // Step 3: Exercise every repository-table leaf explicitly.
    const getSystemRepoTableRows =
      await api.getSystemRepoTableRows(repoTableRequest);
    const getAccountRepoTableRows =
      await api.getAccountRepoTableRows(repoTableRequest);
    const getAuthorizationRepoTableRows =
      await api.getAuthorizationRepoTableRows(repoTableRequest);
    const getActorRepoTableRows =
      await api.getActorRepoTableRows(repoTableRequest);
    const getFrontendRepoTableRows =
      await api.getFrontendRepoTableRows(repoTableRequest);
    const getServiceRepoTableRows =
      await api.getServiceRepoTableRows(repoTableRequest);
    const getAccountBlockRepoTableRows =
      await api.getAccountBlockRepoTableRows(repoTableRequest);
    const getActorBlockRepoTableRows =
      await api.getActorBlockRepoTableRows(repoTableRequest);
    const getFrontendBlockRepoTableRows =
      await api.getFrontendBlockRepoTableRows(repoTableRequest);
    const getServiceBlockRepoTableRows =
      await api.getServiceBlockRepoTableRows(repoTableRequest);
    const getSystemLogRepoTableRows =
      await api.getSystemLogRepoTableRows(repoTableRequest);

    // Step 4: Exercise the final system-spec leaf explicitly.
    const makeSystemSpec = await api.makeSystemSpec(emptyRequest);

    expect(hello).toEqual({ result: encodedError, link: null });
    expect(getFrontendState).toEqual({ result: encodedError, link: null });
    expect(executeServiceQuery).toEqual({ result: encodedError, link: null });
    expect(finalizeAccountCommands).toEqual({
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
    expect(getAccountRepos).toEqual({ result: encodedError, link: null });
    expect(getAccountRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAuthorizationRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAuthorizationRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getActorRepos).toEqual({ result: encodedError, link: null });
    expect(getActorRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getFrontendRepos).toEqual({ result: encodedError, link: null });
    expect(getFrontendRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getServiceRepos).toEqual({ result: encodedError, link: null });
    expect(getServiceRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAccountBlockRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getAccountBlockRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getActorBlockRepos).toEqual({ result: encodedError, link: null });
    expect(getActorBlockRepoTableRows).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getFrontendBlockRepos).toEqual({
      result: encodedError,
      link: null,
    });
    expect(getFrontendBlockRepoTableRows).toEqual({
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
