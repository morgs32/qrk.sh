import { contracts } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartItemV2 } from '../../models/cartItem/CartItemV2';

import { removeFromCartV1 } from './RemoveFromCartV1';

export const removeFromCartV2 = contracts.upgradeVersion(removeFromCartV1, {
  version: '2.0.0',
  payload: {},
  up: ({ payload }) => Effect.succeed(payload),
  models: { cartItem: cartItemV2 },
  program: ({ payload, models }) =>
    Effect.all({
      deleted: models.cartItem.delete({ resourceId: payload.id }),
    }),
});
