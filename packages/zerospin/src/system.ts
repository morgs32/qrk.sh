import { verifyToken } from "@clerk/backend";
import {
  aggregates,
  authentication,
  makeAggregateId,
  makeSelection,
  makeSystem,
  ZerospinError,
} from "@zerospin/sdk";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { createGrid, createPage, createSite, createUser, updateGrid } from "./contracts";
import { Brick } from "./models/Brick";
import { Grid } from "./models/Grid";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { signature } from "./signature";

export const system = makeSystem({
  name: "qrk-sh",
  authentication: [
    authentication.makeVersion({
      version: "1.0.0",
      signature,
      authenticate: Effect.fn("user.authenticate")(function* ({ signature }) {
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
    user: [
      aggregates.makeVersion(aggregates.makeAggregate({ name: "user" }), {
        version: "3.0.0",
        authorize: Effect.fn("user.authorize")(function* ({ aggregateId, userId }) {
          const expectedAggregateId = makeAggregateId({ id: userId });
          if (aggregateId !== expectedAggregateId) {
            return yield* new ZerospinError({
              code: "user-aggregate-mismatch",
              message: `Aggregate ${aggregateId} does not belong to user ${userId}`,
              status: 403,
            });
          }
        }),
        models: {
          brick: Brick,
          grid: Grid,
          page: Page,
          site: Site,
          user: User,
        },
        contracts: {
          createGrid: { contract: createGrid },
          createPage: { contract: createPage },
          createSite: { contract: createSite },
          createUser: { contract: createUser },
          updateGrid: { contract: updateGrid },
        },
        selections: {
          brick: makeSelection({
            model: Brick,
            where: ({ userId }: { userId: string }) => ({
              grid: {
                page: {
                  site: {
                    user: { clerkUserId: userId },
                  },
                },
              },
            }),
          }),
          grid: makeSelection({
            model: Grid,
            where: ({ userId }: { userId: string }) => ({
              page: {
                site: {
                  user: { clerkUserId: userId },
                },
              },
            }),
          }),
          page: makeSelection({
            model: Page,
            where: ({ userId }: { userId: string }) => ({
              site: {
                user: { clerkUserId: userId },
              },
            }),
          }),
          site: makeSelection({
            model: Site,
            where: ({ userId }: { userId: string }) => ({
              user: { clerkUserId: userId },
            }),
          }),
          user: makeSelection({
            model: User,
            where: ({ userId }: { userId: string }) => ({ clerkUserId: userId }),
          }),
        },
      }),
    ],
  },
});
