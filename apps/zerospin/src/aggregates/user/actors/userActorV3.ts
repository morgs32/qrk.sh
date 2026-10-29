import { updateSiteSettingsV1 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV1 as createPage } from "../contracts/createPage/CreatePageV1";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";
import { wallV1 as Wall } from "../models/wall/WallV1";
import { brickV2 as Brick } from "../models/brick/BrickV2";
import { placementV1 as Placement } from "../models/placement/PlacementV1";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV2 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV2";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV3 as addBrick } from "../contracts/wall/AddBrickContractV3";
import { addWallSectionV1 as addWallSection } from "../contracts/wall/AddWallSectionContractV1";
import { movePlacementV2 as movePlacement } from "../contracts/wall/MovePlacementContractV2";
import { moveStackV1 as moveStack } from "../contracts/wall/MoveStackContractV1";
import { deleteBrickV2 as deleteBrick } from "../contracts/wall/DeleteBrickContractV2";
import { updateBrickV3 as updateBrick } from "../contracts/brick/UpdateBrickV3";
import { generateBrickSpecV2 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV2";
import { publishSiteV2 as publishSite } from "../contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "../contracts/publishPage/PublishPageV2";
import { Effect, Schema } from "effect";
import { verifyToken } from "@clerk/backend";
import { mapParseError, prettyUnknownFailure } from "@zerospin/error";

import type { IAnyError } from "@zerospin/error";
import { sql } from "drizzle-orm";
import {
  CuidFactory,
  defineAggregateActor,
  makeAggregateActorRelease,
  makeQueryDbVersion,
  makeId,
  resolveFailure,
  makeZerospinError,
  ZerospinError,
} from "@zerospin/sdk";
import { RoutePattern } from "@remix-run/route-pattern";
import { makeActorIdentity } from "@zerospin/sdk";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV1";
import { userClaims } from "../../../claims";
import { signature } from "../../../signature";
import { createUserV1 } from "../contracts/createUser/CreateUserV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeQueryDbVersion({
  models: {
    wall: Wall,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
});

export const userActorV3 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 3,
  db,
  identity,
  authentication: {
    credentialsSchema: signature,
    authenticate: Effect.fn("userActor.authenticate")(function* (props) {
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
  exposedModels: {
    wall: Wall,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
  authorize: Effect.fn("userActor.authorize")(function* (props): Effect.fn.Return<
    void,
    IAnyError,
    CuidFactory
  > {
    const { claims, db, executeCommand } = props;
    const existingUser = db.query.user
      .findFirst({
        where: { clerkUserId: { eq: claims.clerkUserId } },
      })
      .sync();
    if (existingUser !== undefined) return;

    const outcome = yield* executeCommand({
      commandName: createUserV1.commandName,
      contractVersion: createUserV1.version,
      payload: {
        id: yield* makeId(User),
        clerkUserId: claims.clerkUserId,
        username: null,
        displayName: null,
      },
    });
    if (outcome.result._tag === "Failure") {
      const failure = yield* resolveFailure(createUserV1, outcome.result.failure);
      if (
        !(
          "scope" in failure &&
          failure.scope === "contract" &&
          failure.code === "user-already-exists"
        )
      ) {
        return yield* makeZerospinError(outcome.result.failure);
      }
    }
    const provisionedUser = db.query.user
      .findFirst({
        where: { clerkUserId: { eq: claims.clerkUserId } },
      })
      .sync();
    if (provisionedUser === undefined) {
      return yield* makeZerospinError({
        code: "user-provisioning-failed",
        message: "User provisioning completed without an authenticated user row",
      });
    }
  }),

  contracts: {
    addBrick,
    addWallSection,
    movePlacement,
    moveStack,
    deleteBrick,
    updateBrick,
    setBrickBorderWidth,
    generateBrickSpec,
    publishSite,
    publishPage,
    updateSiteSettings,
    updatePageSettings,
    createSite,
    createPage,
    unpublishSite,
  },
  selections: {
    wall: db.query.wall.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    brick: db.query.brick.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    placement: db.query.placement.findMany({
      where: {
        wall: {
          page: {
            site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
          },
        },
      },
    }),
    page: db.query.page.findMany({
      where: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
    }),
    site: db.query.site.findMany({
      where: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
    }),
    user: db.query.user.findMany({
      where: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } },
    }),
    pageSnapshot: db.query.pageSnapshot.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
        RAW: (snapshot) =>
          sql`exists (select 1 from ${db.config.schema.page} where ${db.config.schema.page.id} = ${snapshot.pageId} and ${db.config.schema.page.publishedSnapshotId} = ${snapshot.id})`,
      },
    }),
  },
});
