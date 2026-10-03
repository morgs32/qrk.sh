import { Schema } from 'effect';

export const ClerkUserIdSchema = Schema.String.check(
  Schema.isMinLength(1),
).pipe(Schema.brand('ClerkUserId'));
export type IClerkUserId = typeof ClerkUserIdSchema.Type;
export const clerkCredentialsSchema = Schema.Struct({ token: Schema.String });
export const userClaims = Schema.Struct({ clerkUserId: ClerkUserIdSchema });
export const userAggregateClaims = Schema.Struct({
  ...userClaims.fields,
  aggregateId: Schema.String.check(Schema.isPattern(/^acct_.+/)),
});
export const userAggregateId = (clerkUserId: IClerkUserId) =>
  `acct_${clerkUserId}`;
