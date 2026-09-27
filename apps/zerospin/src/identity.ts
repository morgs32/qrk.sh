import { Schema } from "effect";

export const userIdentitySchema = Schema.Struct({
  aggregateId: Schema.String,
  clerkUserId: Schema.String,
});
