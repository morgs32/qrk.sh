import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeFulfillmentRequester } from './requestFulfillment.js';

describe('fulfillment domain request', () => {
  const request = {
    requestId: 'req_1',
    purchaseId: 'pur_1',
    userId: 'usr_1',
    aggregateId: 'acct_1',
    serviceVersion: '1.0.0',
  };

  it('submits one stable command and returns the same row on a domain retry', async () => {
    const submitted: unknown[] = [];
    let row: {
      id: `ful_${string}`;
      requestId: string;
      purchaseId: string;
      userId: string;
      aggregateId: string;
    } | null = null;
    const execute = makeFulfillmentRequester({
      findByRequestId: () => Effect.succeed(row),
      submit: props =>
        Effect.sync(() => {
          submitted.push(props);
          row = {
            id: props.fulfillmentId,
            requestId: props.requestId,
            purchaseId: props.purchaseId,
            userId: props.userId,
            aggregateId: props.aggregateId,
          };
        }),
    });
    const first = await Effect.runPromise(execute(request));
    const second = await Effect.runPromise(execute(request));
    expect(first).toEqual(second);
    expect(submitted).toMatchObject([
      {
        commandId: 'cmd_7265715f31',
        fulfillmentId: 'ful_7265715f31',
        serviceVersion: '1.0.0',
      },
    ]);
  });

  it('rejects a reused request identifier with different correlation', async () => {
    const execute = makeFulfillmentRequester({
      findByRequestId: () =>
        Effect.succeed({
          id: 'ful_1' as const,
          requestId: request.requestId,
          purchaseId: 'pur_other',
          userId: request.userId,
          aggregateId: request.aggregateId,
        }),
      submit: () => Effect.void,
    });
    const result = await Effect.runPromise(Effect.result(execute(request)));
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'fulfillment-request-conflict' },
    });
  });
});
