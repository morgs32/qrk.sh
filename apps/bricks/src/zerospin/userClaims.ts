import * as Schema from "effect/Schema";

export const userClaims = Schema.Struct({
  aggregateId: Schema.String,
  clerkUserId: Schema.String,
});
