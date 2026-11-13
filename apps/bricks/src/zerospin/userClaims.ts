import { Schema } from "effect";

export const userClaims = Schema.Struct({
  aggregateId: Schema.String,
  clerkUserId: Schema.String,
});
