import { verifyToken } from "@clerk/backend";
import { RoutePattern } from "@remix-run/route-pattern";
import { signature } from "../../signature";
import {
  makeAggregateVersion,
  makeAggregateId,
  makeSelection,
  makeId,
  ZerospinError,
} from "@zerospin/sdk";
import { Effect, Schema } from "effect";

import { createGridV2 as createGrid } from "./contracts/createGrid/CreateGridV2";
import { createPageV2 as createPage } from "./contracts/createPage/CreatePageV2";
import { createSiteV2 as createSite } from "./contracts/createSite/CreateSiteV2";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updateGridV2 as updateGrid } from "./contracts/updateGrid/UpdateGridV2";
import { updatePageArticleV1 as updatePageArticle } from "./contracts/updatePageArticle/UpdatePageArticleV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { pageV2 as Page } from "./models/page/PageV2";
import { siteV2 as Site } from "./models/site/SiteV2";
import { userV1 as User } from "./models/user/UserV1";
import { user } from "./user";

export const userV8 = makeAggregateVersion(user, {
  version: "8.0.0",
  authentication: {
    signatureSchema: signature,
    authenticationSchema: Schema.Struct({ aggregateId: Schema.String, clerkUserId: Schema.String }),
    selectionSchema: Schema.Struct({ clerkUserId: Schema.String }),
    pattern: RoutePattern.parse("/:clerkUserId"),
    authenticate: ({ signature, executeCommand }) =>
      Effect.gen(function* () {
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

        const aggregateId = makeAggregateId({ id: verifiedToken.sub });
        const result = yield* executeCommand({
          aggregateId,
          contract: createUser,
          payload: {
            id: yield* makeId(User),
            clerkUserId: verifiedToken.sub,
            username: null,
            displayName: null,
          },
        });
        // Repeated authentications retain the first resource ID, including after a lost response.
        if (result.failure !== null && result.failure.code !== "user-already-exists") {
          return yield* new ZerospinError(result.failure);
        }
        return { aggregateId, clerkUserId: verifiedToken.sub };
      }),
  },
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
    updatePageArticle: { contract: updatePageArticle },
    updatePageSettings: { contract: updatePageSettings },
    updateSiteSettings: { contract: updateSiteSettings },
  },
  selections: {
    brick: makeSelection({
      model: Brick,
      where: ({ authentication }: { authentication: { clerkUserId: string } }) => ({
        grid: {
          page: {
            site: {
              user: { clerkUserId: authentication.clerkUserId },
            },
          },
        },
      }),
    }),
    grid: makeSelection({
      model: Grid,
      where: ({ authentication }: { authentication: { clerkUserId: string } }) => ({
        page: {
          site: {
            user: { clerkUserId: authentication.clerkUserId },
          },
        },
      }),
    }),
    page: makeSelection({
      model: Page,
      where: ({ authentication }: { authentication: { clerkUserId: string } }) => ({
        site: {
          user: { clerkUserId: authentication.clerkUserId },
        },
      }),
    }),
    site: makeSelection({
      model: Site,
      where: ({ authentication }: { authentication: { clerkUserId: string } }) => ({
        user: { clerkUserId: authentication.clerkUserId },
      }),
    }),
    user: makeSelection({
      model: User,
      where: ({ authentication }: { authentication: { clerkUserId: string } }) => ({
        clerkUserId: authentication.clerkUserId,
      }),
    }),
  },
});
