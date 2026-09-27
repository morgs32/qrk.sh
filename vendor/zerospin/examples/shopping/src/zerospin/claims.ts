import { Schema } from 'effect';

import { ClerkUserIdSchema } from './aggregates/shopper/models/user/UserV1';

export const clerkCredentialsSchema = Schema.Struct({ token: Schema.String });

export const userClaims = Schema.Struct({
  clerkUserId: ClerkUserIdSchema,
});

export const shopperClaims = Schema.Struct({
  ...userClaims.fields,
  aggregateId: Schema.Literal('acct_1'),
});
