import { authentication, makeSystem } from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { ClerkUserIdSchema } from './aggregates/shopper/models/user/UserV1';
import { shopperV2 } from './aggregates/shopper/ShopperV2';
import { appV1 } from './services/app/AppV1';

export const system = makeSystem({
  name: 'shopping',
  authentication: [
    authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
      authenticate: ({ signature }) => Effect.succeed(signature.clerkUserId),
    }),
  ],
  aggregates: {
    shopper: [shopperV2],
  },
  services: {
    app: [appV1],
  },
});
