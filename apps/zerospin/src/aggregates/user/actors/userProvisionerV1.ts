import { prettyUnknownFailure } from "@zerospin/error";
import { verifyToken } from "@clerk/backend";
import { RoutePattern } from "@remix-run/route-pattern";
import {
  defineAggregateActor,
  makeAggregateActorVersion,
  makeActorDbVersion,
  makeActorIdentity,
  makeAggregateId,
  ZerospinError,
} from "@zerospin/sdk";
import { Effect } from "effect";

import { userClaims } from "../../../claims";
import { signature } from "../../../signature";
import { createUserV1 } from "../contracts/createUser/CreateUserV1";
import { userV1 } from "../models/user/UserV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeActorDbVersion({ models: { user: userV1 } });

export const userProvisionerV1 = makeAggregateActorVersion(
  defineAggregateActor({ name: "provisioner" }),
  {
    version: "1.0.0",
    identity,
    db,
    authentication: {
      credentialsSchema: signature,
      authenticate: Effect.fn("userProvisioner.authenticate")(function* ({ credentials }) {
        const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
        const verifiedToken = yield* Effect.tryPromise({
          try: () =>
            verifyToken(credentials.sessionToken, {
              secretKey: env.CLERK_SECRET_KEY,
              authorizedParties: [env.CLERK_AUTHORIZED_PARTY],
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
          aggregateId: makeAggregateId({ id: verifiedToken.sub }),
          clerkUserId: verifiedToken.sub,
        };
      }),
    },
    contracts: { createUser: createUserV1 },
    queries: {
      user: db.query.user.findMany({
        where: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } },
      }),
    },
  },
);
