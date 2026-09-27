import { Schema } from 'effect';

import { ClerkUserIdSchema } from '../models/user/UserV1';
export const shopperIdentitySchema = Schema.Struct({
  aggregateId: Schema.Literal('acct_1'),
  clerkUserId: ClerkUserIdSchema,
});

export const shopperSelectionSchema = Schema.Struct({
  clerkUserId: ClerkUserIdSchema,
});
