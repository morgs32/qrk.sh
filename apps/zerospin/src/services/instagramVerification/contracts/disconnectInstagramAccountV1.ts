import {
  defineServiceContract,
  findFirst,
  findMany,
  makeServiceContractRelease,
  modelId,
} from "@zerospin/sdk/browser";
import { ActorError, ContractError } from "@zerospin/error";
import { Effect } from "effect";

import { instagramVerificationClaimsSchema } from "../instagramVerificationClaimsSchema";
import { instagramVerificationChallengeV1 } from "../models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { verifiedInstagramAccount } from "../models/verifiedInstagramAccount/verifiedInstagramAccount";
import { verifiedInstagramAccountV1 } from "../models/verifiedInstagramAccount/verifiedInstagramAccountV1";

export const disconnectInstagramAccountV1 = makeServiceContractRelease(
  defineServiceContract("disconnectInstagramAccount"),
  {
    version: 1,
    claims: instagramVerificationClaimsSchema,
    payload: { id: modelId({ model: verifiedInstagramAccount }) },
    failures: {
      accountNotFound: ContractError.schema({ code: "instagram-account-not-found" }),
      accountNotOwned: ActorError.schema({ code: "instagram-account-not-owned" }),
    },
    models: {
      instagramVerificationChallenge: instagramVerificationChallengeV1,
      verifiedInstagramAccount: verifiedInstagramAccountV1,
    },
    operations: {
      deleteAccount: verifiedInstagramAccountV1.operations.delete,
      updateChallenge: instagramVerificationChallengeV1.operations.update,
    },
    program: Effect.fn("disconnectInstagramAccount.program")(function* (props) {
      const { payload, claims, db, operations, failures } = props;
      const account = yield* findFirst({
        db,
        model: verifiedInstagramAccountV1,
        where: { id: { eq: payload.id }, clerkUserId: { eq: claims.clerkUserId } },
      });
      if (account === undefined) {
        return yield* failures.accountNotFound.make({
          message: "Verified Instagram account not found.",
        });
      }
      const challenges = yield* findMany({
        db,
        model: instagramVerificationChallengeV1,
        where: {
          clerkUserId: { eq: claims.clerkUserId },
          receivingAccountId: { eq: account.receivingAccountId },
        },
      });
      for (const challenge of challenges) {
        if (
          challenge.state.status === "resolving" &&
          challenge.state.senderScopedId === account.senderScopedId
        ) {
          yield* operations.updateChallenge({
            resourceId: challenge.id,
            attributes: { state: { status: "superseded" } },
          });
        }
      }
      yield* operations.deleteAccount({ resourceId: account.id });
    }),
  },
);
