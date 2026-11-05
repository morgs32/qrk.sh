import {
  defineServiceContract,
  findFirst,
  makeServiceContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Clock, Effect } from "effect";

import { receivingAccountId } from "../instagramVerificationPolicy";
import { instagramVerificationChallengeV1 } from "../models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { verifiedInstagramAccount } from "../models/verifiedInstagramAccount/verifiedInstagramAccount";
import { resolveInstagramVerificationSenderDefinitionV1 } from "./resolveInstagramVerificationSenderDefinitionV1";

export const receiveInstagramVerificationMessageV1 = makeServiceContractRelease(
  defineServiceContract("receiveInstagramVerificationMessage"),
  {
    version: 1,
    payload: {
      receivingAccountId: primitives.text(),
      senderScopedId: primitives.text(),
      messageId: primitives.text(),
      code: primitives.text(),
      verifiedAccountId: modelId({ model: verifiedInstagramAccount }),
    },
    models: { instagramVerificationChallenge: instagramVerificationChallengeV1 },
    operations: {
      updateChallenge: instagramVerificationChallengeV1.operations.update,
      resolveSender: resolveInstagramVerificationSenderDefinitionV1.externalOperation,
    },
    program: Effect.fn("receiveInstagramVerificationMessage.program")(function* (props) {
      const { payload, db, operations } = props;
      if (payload.receivingAccountId !== receivingAccountId) return;
      const challenge = yield* findFirst({
        db,
        model: instagramVerificationChallengeV1,
        where: {
          code: { eq: payload.code },
          receivingAccountId: { eq: payload.receivingAccountId },
        },
      });
      const now = yield* Clock.currentTimeMillis;
      if (
        challenge === undefined ||
        challenge.state.status !== "pending" ||
        challenge.expiresAt.getTime() <= now
      )
        return;
      yield* operations.updateChallenge({
        resourceId: challenge.id,
        attributes: {
          state: {
            status: "resolving",
            messageId: payload.messageId,
            senderScopedId: payload.senderScopedId,
          },
        },
      });
      yield* operations.resolveSender({
        payload: {
          challengeId: challenge.id,
          clerkUserId: challenge.clerkUserId,
          receivingAccountId: challenge.receivingAccountId,
          senderScopedId: payload.senderScopedId,
          messageId: payload.messageId,
          verifiedAccountId: payload.verifiedAccountId,
        },
      });
    }),
  },
);
