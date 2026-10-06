import { makeZerospinError } from '@zerospin/error';
import { Effect, Layer } from 'effect';

import {
  purchaseDeliveryCommand,
  ShoppingPurchaseDelivery,
} from './ShoppingPurchaseDelivery';

/** Lazy import avoids importing the worker runtime while composing the System. */
export const ShoppingPurchaseDeliveryLive = Layer.succeed(
  ShoppingPurchaseDelivery,
  {
    deliver: input =>
      Effect.gen(function* () {
        const [{ SystemApi }, { default: config }] = yield* Effect.promise(() =>
          Promise.all([
            import('system-worker/SystemApi/SystemApi'),
            import('../../zerospin.config'),
          ]),
        );
        const api = new SystemApi({
          systemId: config.systemId,
          runtime: config.system.runtime,
        });
        const envelope = yield* Effect.promise(() =>
          api.executeAggregateCommand({
            traceContext: null,
            args: [
              {
                aggregateVersion: '1.0.0',
                command: purchaseDeliveryCommand(input),
              },
            ],
          }),
        );
        if (envelope.result._tag === 'Failure') {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'purchase-transfer-failed',
              message:
                'The administrative purchase command could not be confirmed.',
            }),
          );
        }
        const terminal = envelope.result.success;
        if (terminal.execution.status !== 'succeeded') {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'purchase-transfer-rejected',
              message: 'The authoritative purchase command was rejected.',
            }),
          );
        }
      }),
  },
);
