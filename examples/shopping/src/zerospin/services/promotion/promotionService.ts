import * as sdk from '@zerospin/sdk';
import { Clock, Effect, Schema } from 'effect';

import { commitPromotion } from './CommitPromotionV1';
import { promotionReservationV1 } from './models';
import { redeemPromotion } from './RedeemPromotionV1';
import { releasePromotion } from './ReleasePromotionV1';
import { reservePromotion } from './ReservePromotionV1';
export const promotionService = sdk.makeService({
  name: 'promotion',
  module: {
    '1.0.0': {
      models: { promotionReservation: promotionReservationV1 },
      contracts: {
        reservePromotion,
        commitPromotion,
        releasePromotion,
        redeemPromotion,
      },
    },
  },
  queries: {
    '1.0.0': {
      ledger: {
        paramsSchema: Schema.Struct({}),
        query: Effect.fn(function* ({
          db,
        }: {
          db: Pick<
            sdk.IDb<
              sdk.IResourceDbConfig<
                { promotionReservation: typeof promotionReservationV1 },
                Record<never, never>
              >
            >,
            'query'
          >;
          params: {};
        }) {
          return {
            now: yield* Clock.currentTimeMillis,
            reservations: db.query.promotionReservation.findMany().sync(),
          };
        }),
      },
    },
  },
});
