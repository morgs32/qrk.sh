import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Layer, Result, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket';
import { fetchAggregateFrontendState } from './fetchAggregateFrontendState';

const getStateLeaf = vi.hoisted(() => vi.fn());
const createWebSocketTicketLeaf = vi.hoisted(() => vi.fn());
const getAggregateFrontendApiLeaf = vi.hoisted(() => vi.fn());
const disposeGatewayLeaf = vi.hoisted(() => vi.fn());
const newSyncRpcSessionLeaf = vi.hoisted(() => vi.fn());

const mockFrontendApi = {
  getState: getStateLeaf,
  createWebSocketTicket: createWebSocketTicketLeaf,
};

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newSyncRpcSessionLeaf,
}));

const authenticationLock = {
  signature: { version: '1.0.0', schemaJsonSchema: {} },
};
const aggregateFrontendLock = {
  systemName: 'shopping',
  frontendName: 'web',
  models: {},
  contracts: {},
};
const aggregateId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('acct'))(
  'acct_1',
);
const systemId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('sys'))(
  'sys_1',
);
const generateSignature = vi.fn();
const TestLayer = Layer.merge(
  AsyncLive,
  makeTelemetryLayer(makeTelemetryCollector()),
);

describe('@zerospin/frontend programs', () => {
  beforeEach(() => {
    getStateLeaf.mockReset();
    createWebSocketTicketLeaf.mockReset();
    getAggregateFrontendApiLeaf.mockReset();
    disposeGatewayLeaf.mockReset();
    newSyncRpcSessionLeaf.mockReset();
    generateSignature.mockReset();
    generateSignature.mockResolvedValue(encodeSuccess({ userId: 'user_1' }));
    getAggregateFrontendApiLeaf.mockReturnValue(mockFrontendApi);
    newSyncRpcSessionLeaf.mockReturnValue({
      getAggregateFrontendApi: getAggregateFrontendApiLeaf,
      [Symbol.dispose]: disposeGatewayLeaf,
    });
  });

  describe('createAggregateFrontendWebSocketTicket', () => {
    it('uses the admitted target for each fresh ticket request', async () => {
      createWebSocketTicketLeaf
        .mockResolvedValueOnce({
          result: encodeSuccess({ ticket: 'gen_1.raw-ticket-one' }),
          link: null,
        })
        .mockResolvedValueOnce({
          result: encodeSuccess({ ticket: 'gen_1.raw-ticket-two' }),
          link: null,
        });

      const first = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          authenticationLock,
          generateSignature,
          aggregateId,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.provide(TestLayer)),
      );
      const second = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          authenticationLock,
          generateSignature,
          aggregateId,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.provide(TestLayer)),
      );

      expect(first.ticket).toBe('gen_1.raw-ticket-one');
      expect(second.ticket).toBe('gen_1.raw-ticket-two');
      expect(createWebSocketTicketLeaf).toHaveBeenCalledTimes(2);
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledTimes(2);
      expect(getAggregateFrontendApiLeaf).toHaveBeenCalledTimes(2);
      expect(disposeGatewayLeaf).toHaveBeenCalledTimes(2);
    });

    it('preserves an encoded ticket failure without retrying', async () => {
      createWebSocketTicketLeaf.mockResolvedValueOnce({
        result: encodeFailure(
          new ZerospinError({
            code: 'aggregate-frontend-websocket-ticket-write-failed',
            message: 'Ticket storage failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        createAggregateFrontendWebSocketTicket({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          authenticationLock,
          generateSignature,
          aggregateId,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.result, Effect.provide(TestLayer)),
      );

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe(
          'aggregate-frontend-websocket-ticket-write-failed',
        );
      }
      expect(createWebSocketTicketLeaf).toHaveBeenCalledOnce();
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });
  });

  describe('fetchAggregateFrontendState', () => {
    it('wraps the concrete frontend target and returns a typed success', async () => {
      const state = {
        aggregateId: 'acct_1',
        userId: 'user_1',
        systemId,
        systemVersion: '1.0.1',
        aggregateName: 'user',
        frontendName: 'web',
        aggregateIndex: 0,
        frontendIndex: 0,
        pushIndex: 0,
        resolvedPushIndexes: [],
        resources: [],
      };
      getStateLeaf.mockResolvedValueOnce({
        result: encodeSuccess(state),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendState({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          authenticationLock,
          generateSignature,
          aggregateId,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.provide(TestLayer)),
      );

      expect(result).toEqual(state);
      expect(getStateLeaf).toHaveBeenCalledOnce();
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });

    it('converts an encoded domain failure without retrying', async () => {
      getStateLeaf.mockResolvedValueOnce({
        result: encodeFailure(
          new ZerospinError({
            code: 'aggregate-frontend-state-domain-failure',
            message: 'Frontend state lookup failed',
          }),
        ),
        link: null,
      });

      const result = await Effect.runPromise(
        fetchAggregateFrontendState({
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemName: 'shopping',
          authenticationLock,
          generateSignature,
          aggregateId,
          aggregateName: 'user',
          frontendName: 'web',
          aggregateFrontendLock,
        }).pipe(Effect.result, Effect.provide(TestLayer)),
      );

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe(
          'aggregate-frontend-state-domain-failure',
        );
      }
      expect(getStateLeaf).toHaveBeenCalledOnce();
      expect(newSyncRpcSessionLeaf).toHaveBeenCalledOnce();
      expect(disposeGatewayLeaf).toHaveBeenCalledOnce();
    });
  });
});
