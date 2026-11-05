import { findFirst, makeServiceExternalContractRelease } from "@zerospin/sdk";
import { Clock, Effect } from "effect";

import { InstagramProfileProvider } from "../instagramProfileProvider";
import { instagramVerificationChallengeV1 } from "../models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { verifiedInstagramAccountV1 } from "../models/verifiedInstagramAccount/verifiedInstagramAccountV1";
import { resolveInstagramVerificationSenderDefinitionV1 } from "./resolveInstagramVerificationSenderDefinitionV1";

export const resolveInstagramVerificationSenderV1 = makeServiceExternalContractRelease(
  resolveInstagramVerificationSenderDefinitionV1,
  {
    models: {
      instagramVerificationChallenge: instagramVerificationChallengeV1,
      verifiedInstagramAccount: verifiedInstagramAccountV1,
    },
    operations: {
      updateChallenge: instagramVerificationChallengeV1.operations.update,
      createAccount: verifiedInstagramAccountV1.operations.create,
      updateAccount: verifiedInstagramAccountV1.operations.update,
    },
    request: Effect.fn("resolveInstagramVerificationSender.request")(function* (props) {
      const { payload } = props;
      const provider = yield* InstagramProfileProvider;
      return yield* provider.getProfile({ senderScopedId: payload.senderScopedId });
    }),
    program: Effect.fn("resolveInstagramVerificationSender.program")(function* (props) {
      const { payload, externalOutcome, db, operations } = props;
      const challenge = yield* findFirst({
        db,
        model: instagramVerificationChallengeV1,
        where: { id: { eq: payload.challengeId } },
      });
      if (
        challenge === undefined ||
        challenge.clerkUserId !== payload.clerkUserId ||
        challenge.receivingAccountId !== payload.receivingAccountId ||
        challenge.state.status !== "resolving" ||
        challenge.state.messageId !== payload.messageId ||
        challenge.state.senderScopedId !== payload.senderScopedId
      )
        return;
      if (externalOutcome._tag === "Failure") {
        yield* operations.updateChallenge({
          resourceId: challenge.id,
          attributes: {
            state: {
              status: "failed",
              messageId: payload.messageId,
              error: {
                code: "instagram-profile-lookup-failed",
                message:
                  "Instagram could not resolve this sender. Start a fresh verification to retry.",
                retryable: true,
              },
            },
          },
        });
        return;
      }
      const account = yield* findFirst({
        db,
        model: verifiedInstagramAccountV1,
        where: {
          receivingAccountId: { eq: payload.receivingAccountId },
          senderScopedId: { eq: payload.senderScopedId },
        },
      });
      if (account !== undefined && account.clerkUserId !== payload.clerkUserId) {
        yield* operations.updateChallenge({
          resourceId: challenge.id,
          attributes: {
            state: {
              status: "failed",
              messageId: payload.messageId,
              error: {
                code: "instagram-account-already-linked",
                message: "This Instagram account is already linked to another QRK account.",
                retryable: false,
              },
            },
          },
        });
        return;
      }
      const now = yield* Clock.currentTimeMillis;
      if (account === undefined) {
        yield* operations.createAccount({
          resourceId: payload.verifiedAccountId,
          attributes: {
            clerkUserId: payload.clerkUserId,
            receivingAccountId: payload.receivingAccountId,
            senderScopedId: payload.senderScopedId,
            username: externalOutcome.success.username,
            verifiedAt: new Date(now),
            messageId: payload.messageId,
          },
        });
      } else {
        yield* operations.updateAccount({
          resourceId: account.id,
          attributes: {
            username: externalOutcome.success.username,
            verifiedAt: new Date(now),
            messageId: payload.messageId,
          },
        });
      }
      yield* operations.updateChallenge({
        resourceId: challenge.id,
        attributes: { state: { status: "succeeded", messageId: payload.messageId } },
      });
    }),
  },
);
