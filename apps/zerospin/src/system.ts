import { verifyToken } from "@clerk/backend";
import { authentication, makeSystem, ZerospinError } from "@zerospin/sdk";
import { Effect } from "effect";

import { userV3 } from "./aggregates/user/UserV3";
import { signature } from "./signature";

export const system = makeSystem({
  name: "qrk-sh",
  authentication: [
    authentication.makeVersion({
      version: "1.0.0",
      signature,
      authenticate: Effect.fn("user.authenticate")(function* ({ signature }) {
        const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
        const verifiedToken = yield* Effect.tryPromise({
          try: () =>
            verifyToken(signature.sessionToken, {
              secretKey: env.CLERK_SECRET_KEY,
              authorizedParties: [env.CLERK_AUTHORIZED_PARTY],
            }),
          catch: (cause) =>
            new ZerospinError({
              code: "user-session-token-invalid",
              message: "The Clerk session token could not be verified",
              cause: ZerospinError.prettyUnknownFailure(cause),
              status: 401,
            }),
        });

        return verifiedToken.sub;
      }),
    }),
  ],
  aggregates: {
    user: [userV3],
  },
});
