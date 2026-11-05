import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { Schema } from "effect";

import { instagramVerificationChallenge } from "./instagramVerificationChallenge";

export const instagramVerificationChallengeV1 = makeModelVersion(instagramVerificationChallenge, {
  version: 1,
  attributes: {
    clerkUserId: primitives.text(),
    receivingAccountId: primitives.text(),
    code: primitives.text({ unique: true }),
    expiresAt: primitives.date(),
    state: primitives.json({
      schema: Schema.Union([
        Schema.Struct({ status: Schema.Literal("pending") }),
        Schema.Struct({
          status: Schema.Literal("resolving"),
          messageId: Schema.NonEmptyString,
          senderScopedId: Schema.NonEmptyString,
        }),
        Schema.Struct({ status: Schema.Literal("succeeded"), messageId: Schema.NonEmptyString }),
        Schema.Struct({
          status: Schema.Literal("failed"),
          messageId: Schema.NonEmptyString,
          error: Schema.Struct({
            code: Schema.NonEmptyString,
            message: Schema.NonEmptyString,
            retryable: Schema.Boolean,
          }),
        }),
        Schema.Struct({ status: Schema.Literal("superseded") }),
      ]),
    }),
  },
  indexes: [{ name: "instagram_challenge_clerk_user", columns: ["clerkUserId"] }],
});
