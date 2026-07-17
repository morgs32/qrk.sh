import { verifyToken } from "@clerk/backend";
import { makeActorController } from "@zerospin/core/actorController/makeActorController";
import { makeSelection } from "@zerospin/core/models/makeSelection";
import { makeAccountId } from "@zerospin/core/utils/makeAccountId";
import { prefixActorId } from "@zerospin/core/utils/prefixActorId";
import { ZerospinError } from "@zerospin/error";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { Grid } from "./models/Grid";
import { Brick } from "./models/Brick";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { ownerFrontend } from "./ownerFrontend";

export const owner = makeActorController({
  name: "owner",
  models: {
    grid: Grid,
    brick: Brick,
    page: Page,
    site: Site,
    user: User,
  },
  selections: {
    grid: makeSelection({
      model: Grid,
      where: ({ actorId }) => ({
        page: {
          site: {
            user: { actorId },
          },
        },
      }),
    }),
    brick: makeSelection({
      model: Brick,
      where: ({ actorId }) => ({
        grid: {
          page: {
            site: {
              user: { actorId },
            },
          },
        },
      }),
    }),
    page: makeSelection({
      model: Page,
      where: ({ actorId }) => ({
        site: {
          user: { actorId },
        },
      }),
    }),
    site: makeSelection({
      model: Site,
      where: ({ actorId }) => ({
        user: { actorId },
      }),
    }),
    user: makeSelection({
      model: User,
      where: ({ actorId }) => ({ actorId }),
    }),
  },
  frontends: {
    web: {
      frontendController: ownerFrontend,
      authenticate: Effect.fn("owner.authenticate")(function* ({
        signature,
        db,
        makeAccountCommand,
        finalizeAccountCommands,
      }) {
        const verifiedToken = yield* Effect.tryPromise({
          try: () =>
            verifyToken(signature.sessionToken, {
              secretKey: env.CLERK_SECRET_KEY,
              authorizedParties: [env.CLERK_AUTHORIZED_PARTY],
            }),
          catch: (cause) =>
            new ZerospinError({
              code: "owner-session-token-invalid",
              message: "The Clerk session token could not be verified",
              cause: ZerospinError.prettyUnknownFailure(cause),
              status: 401,
            }),
        });

        const clerkUserId = verifiedToken.sub;
        const actorId = prefixActorId(clerkUserId);
        const accountId = makeAccountId({ id: "1" });
        const existingUser = db.query.user
          .findFirst({
            where: { clerkUserId: { eq: clerkUserId } },
          })
          .sync();

        if (existingUser !== undefined) {
          if (existingUser.actorId !== actorId) {
            return yield* new ZerospinError({
              code: "owner-user-actor-mismatch",
              message: `User ${existingUser.id} has an unexpected actor identity`,
              status: 409,
            });
          }

          return {
            actorId,
            accountId,
          };
        }

        const createUserCommand = yield* makeAccountCommand({
          contractName: "createUser",
          payload: {
            id: User.prefixId(clerkUserId),
            clerkUserId,
            username: null,
            displayName: null,
          },
        });

        yield* finalizeAccountCommands({
          commands: [createUserCommand],
        });

        const createdUser = db.query.user
          .findFirst({
            where: { clerkUserId: { eq: clerkUserId } },
          })
          .sync();

        if (createdUser === undefined || createdUser.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "owner-user-create-failed",
            message: `User for verified Clerk identity ${clerkUserId} was not created`,
            status: 500,
          });
        }

        return {
          actorId,
          accountId,
        };
      }),
    },
  },
});
