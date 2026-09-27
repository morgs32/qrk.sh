import * as sdk from '@zerospin/sdk';
import { Effect, Layer } from 'effect';

import { PromotionDevelopment } from './PromotionDevelopment';
export const PromotionDevelopmentLive = Layer.succeed(
  PromotionDevelopment,
  Effect.gen(function* () {
    if (process.env.ZEROSPIN_ENVIRONMENT !== 'dev') {
      return yield* Effect.fail(
        sdk.makeZerospinError({
          code: 'promotion-simulation-disabled',
          message: 'The checkout simulator is available only in development.',
        }),
      );
    }
    return;
  }),
);
