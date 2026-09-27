import { Schema } from 'effect';

import { ClerkUserIdSchema } from './aggregates/shopper/models/user/UserV1';
export { shopperIdentitySchema } from './aggregates/shopper/actors/identities';
export const clerkCredentialsSchema = Schema.Struct({ token: Schema.String });
export const catalogIdentitySchema = Schema.Struct({
  clerkUserId: ClerkUserIdSchema,
});
