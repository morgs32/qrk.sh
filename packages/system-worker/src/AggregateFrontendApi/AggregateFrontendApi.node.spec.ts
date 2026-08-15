import type {
  IEncodedCommand,
  IStagedReplicaCommand,
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

import { AggregateFrontendApi } from './AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from './AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';

const { getSystemRepo } = vi.hoisted(() => ({ getSystemRepo: vi.fn() }));
vi.mock('../SystemRepo/SystemRepo.js', () => ({
  SystemRepo: { getRepo: getSystemRepo },
}));

const getSystemWorker = vi.fn();
const aggregateId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('acct'))(
  'acct_1',
);
const userId = 'user_1';
const actorRef = { aggregateId, aggregateName: 'main', userId };
const aggregateFrontendLock = {
  systemName: 'shopping',
  frontendName: 'default',
  models: {},
  contracts: {},
} satisfies IFrontendControllerSpec['aggregateFrontendLock'];
const frontendSpec = {
  kind: 'aggregate',
  systemName: 'shopping',
  aggregateName: 'main',
  frontendName: 'default',
  modelNames: [],
  models: {},
  contracts: {},
  aggregateFrontendLock,
} satisfies IFrontendControllerSpec;
const runtime = makeSystemRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
});

describe('AggregateFrontendApi', () => {
  beforeEach(() => {
    getSystemRepo.mockReset();
    getSystemWorker.mockReset();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('strictly rejects malformed empty and one-argument tuples before resolving a SystemWorker', async () => {
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
      },
      runtime,
    });

    // Step 1: The zero-argument method rejects an unexpected positional argument.
    const invalidEmptyTupleEnvelope = await Reflect.apply(
      api.createWebSocketTicket,
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
        'aggregate-frontend-api-arguments-invalid',
      );
    }
    expect(Either.isLeft(missingArgument)).toBe(true);
    if (Either.isLeft(missingArgument)) {
      expect(missingArgument.left.code).toBe(
        'aggregate-frontend-api-arguments-invalid',
      );
    }
    expect(Either.isLeft(excessArgument)).toBe(true);
    if (Either.isLeft(excessArgument)) {
      expect(excessArgument.left.code).toBe(
        'aggregate-frontend-api-arguments-invalid',
      );
    }
    expect(Either.isLeft(excessProperty)).toBe(true);
    if (Either.isLeft(excessProperty)) {
      expect(excessProperty.left.code).toBe(
        'aggregate-frontend-api-arguments-invalid',
      );
    }
    expect(getSystemWorker).not.toHaveBeenCalled();
  });

  it('forwards the bound target and returns the ticket', async () => {
    const dispose = vi.fn();
    const createAggregateFrontendWebSocketTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'gen_successor.raw-aggregate-frontend-websocket-ticket',
      }),
    );
    const appendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'AggregateFrontendApi.createWebSocketTicket',
          parentSpanId: null,
          status: 'ok',
        });
        return encodeRight(undefined);
      },
    );
    getSystemWorker.mockReturnValue({
      createAggregateFrontendWebSocketTicket,
      appendTelemetryBatch,
      [Symbol.dispose]: dispose,
    });
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
      },
      runtime,
    });

    const envelope = await api.createWebSocketTicket({
      args: [],
      traceContext: {
        traceId: 'trc_browser',
        parentSpanId: 'spn_browser_websocket',
      },
    });

    expect(await Effect.runPromise(decodeRpc(envelope.result))).toEqual({
      ticket: 'gen_successor.raw-aggregate-frontend-websocket-ticket',
    });
    expect(createAggregateFrontendWebSocketTicket).toHaveBeenCalledWith({
      actorRef,
      frontendName: 'default',
      aggregateFrontendLock,
      generationId: 'gen_test',
    });
    expect(envelope.link).toMatchObject({
      priorTraceId: 'trc_browser',
      priorSpanId: 'spn_browser_websocket',
      kind: 'causedBy',
    });
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('encodes a SystemWorker WebSocket ticket failure and its failed root span', async () => {
    const dispose = vi.fn();
    const ticketError = new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-write-failed',
      message: 'Ticket storage failed',
    });
    const appendTelemetryBatch = vi.fn(
      async (props: { batch: ITelemetryBatch }) => {
        expect(props.batch.spans.at(-1)).toMatchObject({
          name: 'AggregateFrontendApi.createWebSocketTicket',
          parentSpanId: null,
          status: 'error',
        });
        return encodeRight(undefined);
      },
    );
    getSystemWorker.mockReturnValue({
      createAggregateFrontendWebSocketTicket: vi.fn(async () =>
        encodeLeft(ticketError),
      ),
      appendTelemetryBatch,
      [Symbol.dispose]: dispose,
    });
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
      },
      runtime,
    });

    const envelope = await api.createWebSocketTicket({
      args: [],
      traceContext: null,
    });
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe(
        'aggregate-frontend-websocket-ticket-write-failed',
      );
    }
    expect(envelope.link).toBe(null);
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('routes mutation through SystemRepo without lifecycle identity and resolves fresh SystemWorker handles for generation-bound leaves', async () => {
    const completeCommand = {
      id: 'cmd_complete',
      commandName: 'createList',
      payload: '{"id":"lst_complete","name":"Complete"}',
      systemName: 'shopping',
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId,
      aggregateName: 'main',
      frontendName: 'default',
      userId,
      sessionId: 'sesn_complete',
      stagedCursor: 'stcur_complete',
      stagedAt: new Date('2026-08-07T00:00:00.000Z'),
      replicaIndex: 1,
      pushedCursor: null,
      status: 'staged',
    } satisfies IEncodedCommand<IStagedReplicaCommand>;
    const pushCommands = vi.fn(async (_request: unknown) =>
      encodeRight({
        writeIndex: 1,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: [],
        executedCommands: [],
        failedStagedCommands: [],
        failedPushedCommands: [],
      }),
    );
    const executeServiceQuery = vi.fn(async (_request: unknown) =>
      encodeRight({ source: 'service' }),
    );
    const executeAggregateQuery = vi.fn(async (_request: unknown) =>
      encodeRight({ source: 'aggregate' }),
    );
    const getAggregateFrontendState = vi.fn(async (_request: unknown) =>
      encodeRight({
        aggregateId,
        userId,
        systemId: 'sys_1',
        systemVersion: '1.0.1',
        aggregateName: 'main',
        frontendName: 'default',
        frontendIndex: 3,
        pushedCommands: [],
        resources: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
      }),
    );
    const createAggregateFrontendWebSocketTicket = vi.fn(
      async (_request: unknown) =>
        encodeRight({ ticket: 'opaque-aggregate-frontend-ticket' }),
    );
    const appendTelemetryBatch = vi.fn(
      async (_props: { batch: ITelemetryBatch }) => encodeRight(undefined),
    );
    getSystemRepo.mockReturnValue({ pushCommands });
    const systemWorkers = Array.from({ length: 8 }, () => ({
      executeServiceQuery,
      executeAggregateQuery,
      getAggregateFrontendState,
      createAggregateFrontendWebSocketTicket,
      appendTelemetryBatch,
      [Symbol.dispose]: vi.fn(),
    }));
    for (const systemWorker of systemWorkers) {
      getSystemWorker.mockReturnValueOnce(systemWorker);
    }
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
      },
      runtime,
    });

    // Step 1: Exercise every leaf twice through the one admitted capability.
    for (let pass = 0; pass < 2; pass += 1) {
      await api.pushCommands({
        args: [{ commands: [completeCommand] }],
        traceContext: null,
      });
      await api.executeServiceQuery({
        args: [
          {
            serviceName: 'todos',
            queryName: 'list',
            params: { pass },
          },
        ],
        traceContext: null,
      });
      await api.executeAggregateQuery({
        args: [{ queryName: 'current', params: { pass } }],
        traceContext: null,
      });
      await api.getState({ args: [], traceContext: null });
      await api.createWebSocketTicket({
        args: [],
        traceContext: null,
      });
    }

    // Step 2: Every read call resolves the same stable routing name to a fresh handle.
    expect(getSystemWorker).toHaveBeenCalledTimes(8);
    for (let call = 1; call <= 8; call += 1) {
      expect(getSystemWorker).toHaveBeenNthCalledWith(call, {
        systemWorkerName: 'sys_1:dev:user_1',
      });
    }
    expect(new Set(systemWorkers).size).toBe(8);
    for (const systemWorker of systemWorkers) {
      expect(systemWorker[Symbol.dispose]).toHaveBeenCalledOnce();
    }

    // Step 3: Every generation-bound leaf receives the acquired read locator.
    const readRequests = [
      ...executeServiceQuery.mock.calls,
      ...executeAggregateQuery.mock.calls,
      ...getAggregateFrontendState.mock.calls,
      ...createAggregateFrontendWebSocketTicket.mock.calls,
    ].map(call => call[0]);
    expect(readRequests).toHaveLength(8);
    for (const request of readRequests) {
      expect(request).toMatchObject({
        actorRef,
        aggregateFrontendLock,
        frontendName: 'default',
        generationId: 'gen_test',
      });
    }
    expect(getSystemRepo).toHaveBeenCalledTimes(2);
    expect(getSystemRepo).toHaveBeenCalledWith({ systemId: 'sys_1' });
    expect(pushCommands).toHaveBeenCalledTimes(2);
    expect(pushCommands).toHaveBeenCalledWith({
      actorRef,
      frontendName: 'default',
      aggregateFrontendLock,
      commands: [completeCommand],
    });
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(8);
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
          name: 'AggregateFrontendApi.executeServiceQuery',
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
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
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
      actorRef,
      aggregateFrontendLock,
      frontendName: 'default',
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
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
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
    const api = new AggregateFrontendApi({
      authResults: {
        actorRef,
        aggregateFrontendLock,
        generationId: 'gen_test',
        frontendName: 'default',
        frontendSpec,
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'sys_1:dev:user_1',
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

  it('returns the captured encoded error and null link from every AggregateFrontendApiFailure leaf without resolving a SystemWorker', async () => {
    const capturedError = new ZerospinError({
      code: 'aggregate-frontend-authentication-failed',
      message: 'The frontend could not be authenticated',
    });
    const encodedError = encodeLeft(capturedError);
    const api = new AggregateFrontendApiFailure(capturedError);

    // Step 1: Exercise every zero-argument leaf explicitly.
    const getAggregateFrontendState = await api.getState({
      args: [],
      traceContext: null,
    });
    const createAggregateFrontendWebSocketTicket =
      await api.createWebSocketTicket({
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
    const executeAggregateQuery = await api.executeAggregateQuery({
      args: [
        {
          queryName: 'list',
          params: null,
        },
      ],
      traceContext: null,
    });

    expect(getAggregateFrontendState).toEqual({
      result: encodedError,
      link: null,
    });
    expect(createAggregateFrontendWebSocketTicket).toEqual({
      result: encodedError,
      link: null,
    });
    expect(pushCommands).toEqual({ result: encodedError, link: null });
    expect(executeServiceQuery).toEqual({ result: encodedError, link: null });
    expect(executeAggregateQuery).toEqual({ result: encodedError, link: null });
    expect(getSystemWorker).not.toHaveBeenCalled();
  });
});
