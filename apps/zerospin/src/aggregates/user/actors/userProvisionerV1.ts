import { prettyUnknownFailure } from "@zerospin/error";
import { verifyToken } from "@clerk/backend";
import { RoutePattern } from "@remix-run/route-pattern";
import {
  defineAggregateActor,
  makeAggregateActorVersion,
  makeQueryDbVersion,
  makeActorIdentity,
  ZerospinError,
} from "@zerospin/sdk";
import { Effect, Schema } from "effect";
import { mapParseError } from "@zerospin/error";

import { userClaims } from "../../../claims";
import { signature } from "../../../signature";
import { createUserV1 } from "../contracts/createUser/CreateUserV1";
import { userV1 } from "../models/user/UserV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeQueryDbVersion({ models: { user: userV1 } });

export const userProvisionerV1 = makeAggregateActorVersion(
  defineAggregateActor({ name: "provisioner" }),
  {
    version: "1.0.0",
    identity,
    db,
    models: { user: userV1 },
    authentication: {
      credentialsSchema: signature,
      authenticate: Effect.fn("userProvisioner.authenticate")(function* (props) {
        const { credentials } = props;
        const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
        const { CLERK_SECRET_KEY, CLERK_AUTHORIZED_PARTY } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            CLERK_SECRET_KEY: Schema.NonEmptyString,
            CLERK_AUTHORIZED_PARTY: Schema.NonEmptyString,
          }),
        )(env).pipe(
          mapParseError({
            code: "clerk-authentication-binding-unavailable",
            prefix: "Clerk authentication bindings are unavailable",
          }),
        );
        const verifiedToken = yield* Effect.tryPromise({
          try: () =>
            verifyToken(credentials.sessionToken, {
              secretKey: CLERK_SECRET_KEY,
              authorizedParties: [CLERK_AUTHORIZED_PARTY],
            }),
          catch: (cause) =>
            new ZerospinError({
              code: "user-session-token-invalid",
              message: "The Clerk session token could not be verified",
              cause: prettyUnknownFailure(cause),
              status: 401,
            }),
        });
        return {
          aggregateId: verifiedToken.sub,
          clerkUserId: verifiedToken.sub,
        };
      }),
    },
    contracts: { createUser: createUserV1 },
    selections: {
      user: db.query.user.findMany({
        where: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } },
      }),
    },
  },
);
