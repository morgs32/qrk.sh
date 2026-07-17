import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { Effect, Either, Layer } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import { makeDispatchRuntime } from '../makeDispatchRuntime';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';

import { FrontendApi } from './FrontendApi';
import { FrontendApiFailure } from './FrontendApiFailure';

const getSystemWorker = vi.fn();
const runtime = makeDispatchRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
  apiKeyIdentityResolver: Layer.succeed(ApiKeyIdentityResolver, {
    resolve: () => Effect.dieMessage('FrontendApi leaf tests do not resolve API keys'),
  }),
});

describe('FrontendApi', () => {
  beforeEach(() => {
    getSystemWorker.mockReset();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('strictly rejects malformed empty and one-argument tuples before resolving a SystemWorker', async () => {
    const api = new FrontendApi({
      authResults: {
        deployId: 'dpl_test',
        generationId: 'gen_test',
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        accountName: 'main',
        actorName: 'user',
        frontendName: 'default',
        systemId: 'sys_1',
        systemWorkerName: 'sys_1:dev:user_1',
        systemEnvironmentId: 'dev',
      },
      runtime,
    });

    // Step 1: The zero-argument method rejects an unexpected positional argument.
    const invalidEmptyTupleEnvelope = await Reflect.apply(
      api.fetchActor,
      api,
      [
        {
          args: ['unexpected'],
          traceContext: null,
        },
      ],
    );
    const invalidEmptyTuple = await Effect.runPromise(
      decodeRpc(invalidEmptyTupleEnvelope.result).pipe(Effect.either),
    );

    // Step 2: The one-argument method rejects a missing argument.
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

    // Step 3: The one-argument method rejects an extra positional argument.
    const excessArgumentEnvelope = await Reflect.apply(
      api.executeServiceQuery,
      api,
      [
        {
          args: [
            {
              serviceName: 'todos',
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

    // Step 4: Strict struct validation rejects extra properties on the argument.
    const excessPropertyEnvelope = await Reflect.apply(
      api.executeServiceQuery,
      api,
      [
        {
          args: [
            {
              serviceName: 'todos',
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
      expect(invalidEmptyTuple.left.code).toBe(
        'frontend-api-arguments-invalid',
      );
    }
    expect(Either.isLeft(missingArgument)).toBe(true);
    if (Either.isLeft(missingArgument)) {
      expect(missingArgument.left.code).toBe('frontend-api-arguments-invalid');
    }
    expect(Either.isLeft(excessArgument)).toBe(true);
    if (Either.isLeft(excessArgument)) {
      expect(excessArgument.left.code).toBe('frontend-api-arguments-invalid');
    }
    expect(Either.isLeft(excessProperty)).toBe(true);
    if (Either.isLeft(excessProperty)) {
      expect(excessProperty.left.code).toBe('frontend-api-arguments-invalid');
    }
    expect(getSystemWorker).not.toHaveBeenCalled();
  });

  it('resolves and disposes a fresh SystemWorker for every successful leaf call', async () => {
    const firstDispose = vi.fn();
    const firstSystemWorker = {
      getSystemSpec: vi.fn(async () =>
        encodeRight({
          systemName: 'shopping',
          version: '1.0.1',
          services: {},
        }),
      ),
      appendTelemetryBatch: vi.fn(
        async (props: { batch: ITelemetryBatch }) => {
          const rootSpan = props.batch.spans.at(-1);
          expect(rootSpan).toBeDefined();
          expect(rootSpan?.name).toBe('FrontendApi.fetchActor');
          expect(rootSpan?.parentSpanId).toBe(null);
          expect(rootSpan?.status).toBe('ok');
          expect(rootSpan?.endedAt).toBeGreaterThanOrEqual(
            rootSpan?.startedAt ?? Number.POSITIVE_INFINITY,
          );
          return encodeRight(undefined);
        },
      ),
      [Symbol.dispose]: firstDispose,
    };
    const secondDispose = vi.fn();
    const secondSystemWorker = {
      getSystemSpec: vi.fn(async () =>
        encodeRight({
          systemName: 'shopping',
          version: '1.0.2',
          services: {},
        }),
      ),
      appendTelemetryBatch: vi.fn(
        async (props: { batch: ITelemetryBatch }) => {
          const rootSpan = props.batch.spans.at(-1);
          expect(rootSpan).toBeDefined();
          expect(rootSpan?.name).toBe('FrontendApi.fetchActor');
          expect(rootSpan?.parentSpanId).toBe(null);
          expect(rootSpan?.status).toBe('ok');
          return encodeRight(undefined);
        },
      ),
      [Symbol.dispose]: secondDispose,
    };
    getSystemWorker
      .mockReturnValueOnce(firstSystemWorker)
      .mockReturnValueOnce(secondSystemWorker);
    const api = new FrontendApi({
      authResults: {
        deployId: 'dpl_test',
        generationId: 'gen_test',
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        accountName: 'main',
        actorName: 'user',
        frontendName: 'default',
        systemId: 'sys_1',
        systemWorkerName: 'sys_1:dev:user_1',
        systemEnvironmentId: 'dev',
      },
      runtime,
    });

    // Step 1: Each call resolves its own disposable stub instead of retaining one.
    const firstEnvelope = await api.fetchActor({
      args: [],
      traceContext: {
        traceId: 'trc_browser',
        parentSpanId: 'spn_browser_first',
      },
    });
    const secondEnvelope = await api.fetchActor({
      args: [],
      traceContext: {
        traceId: 'trc_browser',
        parentSpanId: 'spn_browser_second',
      },
    });
    const firstResult = await Effect.runPromise(decodeRpc(firstEnvelope.result));
    const secondResult = await Effect.runPromise(
      decodeRpc(secondEnvelope.result),
    );

    // Step 2: The completed server root is persisted before the causal link is returned.
    expect(firstResult).toEqual({
      actor: {
        accountId: 'acct_1',
        actorId: 'actr_1',
      },
      systemId: 'sys_1',
      deployId: 'dpl_test',
      generationId: 'gen_test',
      systemVersion: '1.0.1',
      systemWorkerName: 'sys_1:dev:user_1',
      systemEnvironmentId: 'dev',
    });
    expect(secondResult).toMatchObject({
      deployId: 'dpl_test',
      generationId: 'gen_test',
      systemVersion: '1.0.2',
    });
    expect(firstEnvelope.link).toMatchObject({
      priorTraceId: 'trc_browser',
      priorSpanId: 'spn_browser_first',
      kind: 'causedBy',
    });
    expect(firstEnvelope.link?.traceId).toMatch(/^trc_/);
    expect(firstEnvelope.link?.spanId).toMatch(/^spn_/);
    expect(secondEnvelope.link).toMatchObject({
      priorTraceId: 'trc_browser',
      priorSpanId: 'spn_browser_second',
      kind: 'causedBy',
    });
    expect(secondEnvelope.link?.traceId).toMatch(/^trc_/);
    expect(secondEnvelope.link?.spanId).toMatch(/^spn_/);
    expect(getSystemWorker).toHaveBeenNthCalledWith(1, {
      systemWorkerName: 'sys_1:dev:user_1',
    });
    expect(getSystemWorker).toHaveBeenNthCalledWith(2, {
      systemWorkerName: 'sys_1:dev:user_1',
    });
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it('preserves a domain failure, persists its failed root, and disposes the acquired SystemWorker', async () => {
    const domainError = new ZerospinError({
      code: 'service-query-failed',
      message: 'The service query failed',
    });
    const dispose = vi.fn();
    const executeServiceQuery = vi.fn(async () => encodeLeft(domainError));
    const appendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'FrontendApi.executeServiceQuery',
          parentSpanId: null,
          status: 'error',
        });
        return encodeRight(undefined);
      },
    );
    getSystemWorker.mockReturnValue({
      executeServiceQuery,
      appendTelemetryBatch,
      [Symbol.dispose]: dispose,
    });
    const api = new FrontendApi({
      authResults: {
        deployId: 'dpl_test',
        generationId: 'gen_test',
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        accountName: 'main',
        actorName: 'user',
        frontendName: 'default',
        systemId: 'sys_1',
        systemWorkerName: 'sys_1:dev:user_1',
        systemEnvironmentId: 'dev',
      },
      runtime,
    });

    const envelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'todos',
          queryName: 'list',
          params: { completed: false },
        },
      ],
      traceContext: {
        traceId: 'trc_browser',
        parentSpanId: 'spn_browser_query',
      },
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('service-query-failed');
    }
    expect(executeServiceQuery).toHaveBeenCalledWith({
      deployId: 'dpl_test',
      generationId: 'gen_test',
      serviceName: 'todos',
      queryName: 'list',
      params: { completed: false },
    });
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(1);
    expect(envelope.link).toMatchObject({
      priorTraceId: 'trc_browser',
      priorSpanId: 'spn_browser_query',
      kind: 'causedBy',
    });
    expect(envelope.link?.traceId).toMatch(/^trc_/);
    expect(envelope.link?.spanId).toMatch(/^spn_/);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful leaf result when telemetry persistence rejects', async () => {
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      executeServiceQuery: vi.fn(async () => encodeRight('kept-result')),
      appendTelemetryBatch: vi.fn(async () => {
        throw new Error('telemetry sink unavailable');
      }),
      [Symbol.dispose]: dispose,
    });
    const api = new FrontendApi({
      authResults: {
        deployId: 'dpl_test',
        generationId: 'gen_test',
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        accountName: 'main',
        actorName: 'user',
        frontendName: 'default',
        systemId: 'sys_1',
        systemWorkerName: 'sys_1:dev:user_1',
        systemEnvironmentId: 'dev',
      },
      runtime,
    });

    const envelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'todos',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: {
        traceId: 'trc_browser',
        parentSpanId: 'spn_browser_query',
      },
    });

    expect(await Effect.runPromise(decodeRpc(envelope.result))).toBe(
      'kept-result',
    );
    expect(envelope.link).toBe(null);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful leaf result when telemetry persistence returns an encoded failure', async () => {
    const persistenceError = new ZerospinError({
      code: 'telemetry-persistence-failed',
      message: 'The telemetry sink rejected the batch',
    });
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      executeServiceQuery: vi.fn(async () => encodeRight('kept-result')),
      appendTelemetryBatch: vi.fn(async () => encodeLeft(persistenceError)),
      [Symbol.dispose]: dispose,
    });
    const api = new FrontendApi({
      authResults: {
        deployId: 'dpl_test',
        generationId: 'gen_test',
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        accountName: 'main',
        actorName: 'user',
        frontendName: 'default',
        systemId: 'sys_1',
        systemWorkerName: 'sys_1:dev:user_1',
        systemEnvironmentId: 'dev',
      },
      runtime,
    });

    const envelope = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'todos',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: {
        traceId: 'trc_browser',
        parentSpanId: 'spn_browser_query',
      },
    });

    expect(await Effect.runPromise(decodeRpc(envelope.result))).toBe(
      'kept-result',
    );
    expect(envelope.link).toBe(null);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('returns the captured encoded error and null link from every FrontendApiFailure leaf without resolving a SystemWorker', async () => {
    const capturedError = new ZerospinError({
      code: 'frontend-authentication-failed',
      message: 'The frontend could not be authenticated',
    });
    const encodedError = encodeLeft(capturedError);
    const api = new FrontendApiFailure(capturedError);

    // Step 1: Exercise all three zero-argument leaves explicitly.
    const makeFrontendSpec = await api.makeFrontendSpec({
      args: [],
      traceContext: null,
    });
    const getFrontendState = await api.getFrontendState({
      args: [],
      traceContext: null,
    });
    const fetchActor = await api.fetchActor({
      args: [],
      traceContext: null,
    });

    // Step 2: Exercise all three one-argument leaves explicitly.
    const pushCommands = await api.pushCommands({
      args: [{ commands: [] }],
      traceContext: null,
    });
    const executeServiceQuery = await api.executeServiceQuery({
      args: [
        {
          serviceName: 'todos',
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: null,
    });
    const executeActorQuery = await api.executeActorQuery({
      args: [
        {
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: null,
    });

    expect(makeFrontendSpec).toEqual({ result: encodedError, link: null });
    expect(getFrontendState).toEqual({ result: encodedError, link: null });
    expect(fetchActor).toEqual({ result: encodedError, link: null });
    expect(pushCommands).toEqual({ result: encodedError, link: null });
    expect(executeServiceQuery).toEqual({ result: encodedError, link: null });
    expect(executeActorQuery).toEqual({ result: encodedError, link: null });
    expect(getSystemWorker).not.toHaveBeenCalled();
  });
});
