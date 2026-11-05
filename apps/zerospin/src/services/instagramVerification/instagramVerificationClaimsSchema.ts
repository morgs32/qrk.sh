import { Schema } from "effect";

export const instagramVerificationClaimsSchema = Schema.Struct({
  clerkUserId: Schema.NonEmptyString,
});
