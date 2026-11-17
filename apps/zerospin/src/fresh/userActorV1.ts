import {
  CuidFactory,
  defineAggregateActor,
  makeActorIdentity,
  makeAggregateActorRelease,
  makeId,
  makeQueryDbVersion,
  makeZerospinError,
  resolveFailure,
  ZerospinError,
} from "@zerospin/sdk";
import { verifyToken } from "@clerk/backend";
import { RoutePattern } from "@remix-run/route-pattern";
import { mapParseError, prettyUnknownFailure, type IAnyError } from "@zerospin/error";
import { Effect, Schema } from "effect";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { siteFailureV1 } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import { signature } from "../signature";
import { createUserV1 } from "./contracts/CreateUserV1";
import { sql } from "drizzle-orm";
import { brickContracts } from "@qrk.sh/bricks/zerospin/brickContracts";
import { createSiteV1 as createSite } from "./contracts/CreateSiteV1";
import { createPageV1 as createPage } from "./contracts/CreatePageV1";
import { deleteBrickV1 as deleteBrick } from "./contracts/wall/DeleteBrickContractV1";
import { deleteStackV1 as deleteStack } from "./contracts/wall/DeleteStackContractV1";
import { movePlacementToRowV1 as movePlacementToRow } from "./contracts/wall/MovePlacementToRowContractV1";
import { movePlacementToNewRowV1 as movePlacementToNewRow } from "./contracts/wall/MovePlacementToNewRowContractV1";
import { movePlacementToNewStackV1 as movePlacementToNewStack } from "./contracts/wall/MovePlacementToNewStackContractV1";
import { movePlacementToNewSectionV1 as movePlacementToNewSection } from "./contracts/wall/MovePlacementToNewSectionContractV1";
import { moveStackV1 as moveStack } from "./contracts/wall/MoveStackContractV1";
import { insertStackV1 as insertStack } from "./contracts/wall/InsertStackContractV1";
import { publishPageV1 as publishPage } from "./contracts/PublishPageV1";
import { publishSiteV1 as publishSite } from "./contracts/PublishSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/UpdatePageSettingsV1";
import { unpublishSiteV1 as unpublishSite } from "./contracts/UnpublishSiteV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/UpdateSiteSettingsV1";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "./contracts/SetBrickBorderWidthV1";
import { addWallSectionV1 as addWallSection } from "./contracts/wall/AddWallSectionContractV1";
import { renameStackV1 as renameStack } from "./contracts/wall/RenameStackContractV1";
import { setRowWidthWeightsV1 as setRowWidthWeights } from "./contracts/wall/SetRowWidthWeightsV1";
import { setRowMinHeightV1 as setRowMinHeight } from "./contracts/wall/SetRowMinHeightV1";
import { setRowPreferredWidthV1 as setRowPreferredWidth } from "./contracts/wall/SetRowPreferredWidthV1";
import { setRowAlignmentV1 as setRowAlignment } from "./contracts/wall/SetRowAlignmentV1";
import { setStackWidthWeightsV1 as setStackWidthWeights } from "./contracts/wall/SetStackWidthWeightsV1";
import { wallV1 as Wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import { brickV1 as Brick } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { placementV1 as Placement } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";
import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

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
    siteFailure: siteFailureV1,
  },
});

export const userActorV1 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 1,
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
  exposedModels: {
    wall: Wall,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
    siteFailure: siteFailureV1,
  },
  contracts: {
    deleteBrick,
    deleteStack,
    movePlacementToRow,
    movePlacementToNewRow,
    movePlacementToNewStack,
    movePlacementToNewSection,
    moveStack,
    insertStack,
    createSite,
    createPage,
    publishPage,
    publishSite,
    updatePageSettings,
    unpublishSite,
    updateSiteSettings,
    setBrickBorderWidth,
    addWallSection,
    renameStack,
    setRowWidthWeights,
    setRowMinHeight,
    setRowPreferredWidth,
    setRowAlignment,
    setStackWidthWeights,
    ...brickContracts,
  },
  selections: {
    siteFailure: db.query.siteFailure.findMany({
      where: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
    }),
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
