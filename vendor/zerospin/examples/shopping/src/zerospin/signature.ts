import { Schema } from 'effect';

import { ClerkUserIdSchema } from './aggregates/shopper/models/user/UserV1';

export const signature = {
  version: '1.0.0',
  signature: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
};
