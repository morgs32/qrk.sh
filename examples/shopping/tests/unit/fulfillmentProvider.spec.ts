import { makeZerospinError } from '@zerospin/error';
import { FulfillmentClient } from '@zerospin/fulfillment/server';
import { Effect } from 'effect';
import { beforeEach, expect, it, vi } from 'vitest';

import { FulfillmentClientLive } from '../../src/zerospin/FulfillmentClientLive';
const remote = vi.hoisted(() => ({
  row: null as null | {
    id: string;
    modelName: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
    requestId: string;
    aggregateId: string;
    userId: string;
    purchaseId: string;
    status: string;
    trackingId: string | null;
  },
  calls: [] as unknown[][],
  loseResponse: false,
  reject: false,
}));
vi.mock('../../src/zerospin/services/trustedService', () => ({
  trustedService: () =>
    Effect.succeed({
      query: () => Effect.succeed(remote.row),
      execute: (...args: unknown[]) => {
        remote.calls.push(args);
        if (remote.reject) {
          return Effect.succeed({
            execution: {
              status: 'failed',
              failure: { message: 'Service rejected the operation' },
            },
          });
        }
        if (remote.row) {
          remote.row = {
            ...remote.row,
            status: args[0] === 'markPacked' ? 'packed' : 'shipped',
            trackingId:
              args[0] === 'markShipped' ? `simulated_${remote.row.id}` : null,
          };
        }
        if (remote.loseResponse) {
          remote.loseResponse = false;
          return Effect.fail(makeZerospinError('response-lost'));
        }
        return Effect.succeed({ execution: { status: 'succeeded' } });
      },
    }),
}));
const request = {
  serviceVersion: '1.0.0',
  operationId: 'fop_pack' as const,
  fulfillmentId: 'ful_test' as const,
  action: 'pack' as const,
  requestId: 'purchase:pur_test',
  purchaseId: 'pur_test',
  userId: 'usr_test',
  aggregateId: 'acct_test',
};
const operate = () =>
  Effect.runPromise(
    Effect.flatMap(FulfillmentClient, client => client.operate(request)).pipe(
      Effect.provide(FulfillmentClientLive),
    ),
  );
beforeEach(() => {
  remote.row = {
    id: 'ful_test',
    modelName: 'fulfillment',
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    requestId: 'purchase:pur_test',
    aggregateId: 'acct_test',
    userId: 'usr_test',
    purchaseId: 'pur_test',
    status: 'requested',
    trackingId: null,
  };
  remote.calls = [];
  remote.loseResponse = false;
  remote.reject = false;
});
it('recovers a lost service response from the authored query without repeating the write', async () => {
  remote.loseResponse = true;
  await expect(operate()).rejects.toThrow();
  expect(remote.calls).toHaveLength(1);
  expect(await operate()).toMatchObject({
    kind: 'confirmed',
    fulfillment: { status: 'packed' },
  });
  expect(remote.calls).toHaveLength(1);
  expect(remote.calls[0]?.[2]).toBe('cmd_fop_pack');
});
it('returns confirmed service rejection so the operation can persist failure', async () => {
  remote.reject = true;
  expect(await operate()).toEqual({
    kind: 'rejected',
    reason: 'Service rejected the operation',
  });
});
it('rejects mismatched purchase ownership before sending a service command', async () => {
  if (remote.row) remote.row.userId = 'usr_other';
  expect(await operate()).toMatchObject({ kind: 'rejected' });
  expect(remote.calls).toHaveLength(0);
});
