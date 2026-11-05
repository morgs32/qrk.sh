import { verifyToken } from "@clerk/backend";
import { RoutePattern } from "@remix-run/route-pattern";
import {
  defineServiceActor,
  findFirst,
  makeActorIdentity,
  makeQueryDbVersion,
  makeServiceActorRelease,
} from "@zerospin/sdk";
import { makeZerospinError } from "@zerospin/error";
import { Effect, Schema } from "effect";

import { signature } from "../../../signature";
import { disconnectInstagramAccountV1 } from "../contracts/disconnectInstagramAccountV1";
import { startInstagramVerificationV1 } from "../contracts/startInstagramVerificationV1";
import { instagramVerificationClaimsSchema } from "../instagramVerificationClaimsSchema";
import { instagramVerificationChallengeV1 } from "../models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { verifiedInstagramAccountV1 } from "../models/verifiedInstagramAccount/verifiedInstagramAccountV1";

const db = makeQueryDbVersion({
  models: {
    instagramVerificationChallenge: instagramVerificationChallengeV1,
    verifiedInstagramAccount: verifiedInstagramAccountV1,
  },
});
const identity = makeActorIdentity({
  claims: instagramVerificationClaimsSchema,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});

export const instagramVerificationActorV1 = makeServiceActorRelease(
  defineServiceActor({ name: "web" }),
  {
    version: 1,
    db,
    identity,
    authentication: {
      credentialsSchema: signature,
      authenticate: Effect.fn("instagramVerificationActor.authenticate")(function* (props) {
        const { credentials } = props;
        const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
        const { CLERK_SECRET_KEY, CLERK_AUTHORIZED_PARTY } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            CLERK_SECRET_KEY: Schema.NonEmptyString,
            CLERK_AUTHORIZED_PARTY: Schema.NonEmptyString,
          }),
        )(env).pipe(
          Effect.mapError(() =>
            makeZerospinError({
              code: "clerk-authentication-binding-unavailable",
              message: "Clerk authentication is not configured.",
            }),
          ),
        );
        const token = yield* Effect.tryPromise({
          try: () =>
            verifyToken(credentials.sessionToken, {
              secretKey: CLERK_SECRET_KEY,
              authorizedParties: [CLERK_AUTHORIZED_PARTY],
            }),
          catch: () =>
            makeZerospinError({
              code: "user-session-token-invalid",
              message: "The Clerk session token could not be verified.",
              status: 401,
            }),
        });
        return { clerkUserId: token.sub };
      }),
    },
    exposedModels: {
      instagramVerificationChallenge: instagramVerificationChallengeV1,
      verifiedInstagramAccount: verifiedInstagramAccountV1,
    },
    contracts: {
      startInstagramVerification: startInstagramVerificationV1,
      disconnectInstagramAccount: disconnectInstagramAccountV1,
    },
    selections: {
      instagramVerificationChallenge: db.query.instagramVerificationChallenge.findMany({
        where: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } },
      }),
      verifiedInstagramAccount: db.query.verifiedInstagramAccount.findMany({
        where: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } },
      }),
    },
    guards: {
      startInstagramVerification: Effect.fn("instagramVerificationActor.startGuard")(
        function* (props) {
          const { payload, db, failures } = props;
          const existingId = yield* findFirst({
            db,
            model: instagramVerificationChallengeV1,
            where: { id: { eq: payload.id } },
          });
          const existingCode = yield* findFirst({
            db,
            model: instagramVerificationChallengeV1,
            where: { code: { eq: payload.code } },
          });
          if (existingId !== undefined || existingCode !== undefined) {
            return yield* failures.challengeConflict.make({
              message: "Generate a fresh verification challenge.",
              status: 409,
            });
          }
        },
      ),
      disconnectInstagramAccount: Effect.fn("instagramVerificationActor.disconnectGuard")(
        function* (props) {
          const { payload, claims, db, failures } = props;
          const account = yield* findFirst({
            db,
            model: verifiedInstagramAccountV1,
            where: { id: { eq: payload.id } },
          });
          if (account === undefined || account.clerkUserId !== claims.clerkUserId) {
            return yield* failures.accountNotOwned.make({
              message: "This verified Instagram account is not yours.",
              status: 403,
            });
          }
        },
      ),
    },
  },
);
