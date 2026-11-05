import {
  defineServiceContract,
  findMany,
  makeServiceContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { ActorError, ContractError } from "@zerospin/error";
import { Clock, Effect } from "effect";

import { instagramVerificationClaimsSchema } from "../instagramVerificationClaimsSchema";
import {
  challengeLifetimeMs,
  receivingAccountId,
  receivingUsername,
} from "../instagramVerificationPolicy";
import { instagramVerificationChallenge } from "../models/instagramVerificationChallenge/instagramVerificationChallenge";
import { instagramVerificationChallengeV1 } from "../models/instagramVerificationChallenge/instagramVerificationChallengeV1";

export const startInstagramVerificationV1 = makeServiceContractRelease(
  defineServiceContract("startInstagramVerification"),
  {
    version: 1,
    claims: instagramVerificationClaimsSchema,
    payload: { id: modelId({ model: instagramVerificationChallenge }), code: primitives.text() },
    failures: {
      configurationUnavailable: ContractError.schema({
        code: "instagram-verification-not-configured",
      }),
      codeInvalid: ContractError.schema({ code: "instagram-verification-code-invalid" }),
      challengeConflict: ActorError.schema({ code: "instagram-verification-challenge-conflict" }),
    },
    models: { instagramVerificationChallenge: instagramVerificationChallengeV1 },
    operations: {
      createChallenge: instagramVerificationChallengeV1.operations.create,
      updateChallenge: instagramVerificationChallengeV1.operations.update,
    },
    program: Effect.fn("startInstagramVerification.program")(function* (props) {
      const { claims, payload, db, operations, failures } = props;
      if (
        receivingAccountId === undefined ||
        receivingAccountId === "" ||
        receivingUsername === undefined ||
        receivingUsername === ""
      ) {
        return yield* failures.configurationUnavailable.make({
          message: "Instagram verification is not configured.",
        });
      }
      if (!/^[a-f0-9]{32}$/.test(payload.code)) {
        return yield* failures.codeInvalid.make({ message: "Generate a fresh verification code." });
      }
      const challenges = yield* findMany({
        db,
        model: instagramVerificationChallengeV1,
        where: { clerkUserId: { eq: claims.clerkUserId } },
      });
      for (const challenge of challenges) {
        if (challenge.state.status === "pending" || challenge.state.status === "resolving") {
          yield* operations.updateChallenge({
            resourceId: challenge.id,
            attributes: { state: { status: "superseded" } },
          });
        }
      }
      const now = yield* Clock.currentTimeMillis;
      yield* operations.createChallenge({
        resourceId: payload.id,
        attributes: {
          clerkUserId: claims.clerkUserId,
          receivingAccountId,
          code: payload.code,
          expiresAt: new Date(now + challengeLifetimeMs),
          state: { status: "pending" },
        },
      });
    }),
  },
);
