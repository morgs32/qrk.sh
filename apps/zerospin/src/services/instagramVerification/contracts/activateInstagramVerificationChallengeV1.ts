import {
  defineServiceContract,
  findFirst,
  makeServiceContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Clock, Effect } from "effect";

import { receivingAccountId } from "../instagramVerificationPolicy";
import { instagramVerificationChallenge } from "../models/instagramVerificationChallenge/instagramVerificationChallenge";
import { instagramVerificationChallengeV1 } from "../models/instagramVerificationChallenge/instagramVerificationChallengeV1";

export const activateInstagramVerificationChallengeV1 = makeServiceContractRelease(
  defineServiceContract("activateInstagramVerificationChallenge"),
  {
    version: 1,
    payload: {
      challengeId: modelId({ model: instagramVerificationChallenge }),
      clerkUserId: primitives.text(),
      receivingAccountId: primitives.text(),
    },
    models: { instagramVerificationChallenge: instagramVerificationChallengeV1 },
    operations: { updateChallenge: instagramVerificationChallengeV1.operations.update },
    program: Effect.fn("activateInstagramVerificationChallenge.program")(function* (props) {
      const { payload, db, operations } = props;
      if (payload.receivingAccountId !== receivingAccountId) return;
      const challenge = yield* findFirst({
        db,
        model: instagramVerificationChallengeV1,
        where: { id: { eq: payload.challengeId } },
      });
      const now = yield* Clock.currentTimeMillis;
      if (
        challenge === undefined ||
        challenge.state.status !== "issuing" ||
        challenge.clerkUserId !== payload.clerkUserId ||
        challenge.receivingAccountId !== payload.receivingAccountId ||
        challenge.expiresAt.getTime() <= now
      )
        return;
      yield* operations.updateChallenge({
        resourceId: challenge.id,
        attributes: { state: { status: "pending" } },
      });
    }),
  },
);
