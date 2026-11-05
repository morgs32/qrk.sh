import { defineServiceExternalContract, modelId, primitives } from "@zerospin/sdk/browser";
import { Schema } from "effect";

import { instagramVerificationChallenge } from "../models/instagramVerificationChallenge/instagramVerificationChallenge";
import { verifiedInstagramAccount } from "../models/verifiedInstagramAccount/verifiedInstagramAccount";

export const resolveInstagramVerificationSenderDefinitionV1 = defineServiceExternalContract({
  name: "resolveInstagramVerificationSender",
  version: 1,
  payload: {
    challengeId: modelId({ model: instagramVerificationChallenge }),
    clerkUserId: primitives.text(),
    receivingAccountId: primitives.text(),
    senderScopedId: primitives.text(),
    messageId: primitives.text(),
    verifiedAccountId: modelId({ model: verifiedInstagramAccount }),
  },
  response: Schema.Struct({ username: Schema.NonEmptyString }),
  timeoutMs: 30_000,
});
