import { updateSiteSettingsV1 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV1 as createPage } from "../contracts/createPage/CreatePageV1";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";
import { wallV1 as Wall } from "../models/wall/WallV1";
import { brickV1 as Brick } from "../models/brick/BrickV1";
import { placementV1 as Placement } from "../models/placement/PlacementV1";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV1 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV1";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV1 as addBrick } from "../contracts/wall/AddBrickContractV1";
import { addWallSectionV1 as addWallSection } from "../contracts/wall/AddWallSectionContractV1";
import { movePlacementV1 as movePlacement } from "../contracts/wall/MovePlacementContractV1";
import { moveStackV1 as moveStack } from "../contracts/wall/MoveStackContractV1";
import { deleteBrickV1 as deleteBrick } from "../contracts/wall/DeleteBrickContractV1";
import { updateBrickV1 as updateBrick } from "../contracts/brick/UpdateBrickV1";
import { generateBrickSpecServerV1 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecServerV1";
import { updateArticleSpecAtBreakpointV1 as updateArticleSpecAtBreakpoint } from "../contracts/brick/UpdateArticleSpecAtBreakpointV1";
import { updateFigmaThumbnailSpecAtBreakpointV1 as updateFigmaThumbnailSpecAtBreakpoint } from "../contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV1";
import { updateGithubActivitySpecAtBreakpointV1 as updateGithubActivitySpecAtBreakpoint } from "../contracts/brick/UpdateGithubActivitySpecAtBreakpointV1";
import { updateGithubProfileSpecAtBreakpointV1 as updateGithubProfileSpecAtBreakpoint } from "../contracts/brick/UpdateGithubProfileSpecAtBreakpointV1";
import { updateGithubRepoSpecAtBreakpointV1 as updateGithubRepoSpecAtBreakpoint } from "../contracts/brick/UpdateGithubRepoSpecAtBreakpointV1";
import { updateImageSpecAtBreakpointV1 as updateImageSpecAtBreakpoint } from "../contracts/brick/UpdateImageSpecAtBreakpointV1";
import { updateInstagramSpecAtBreakpointV1 as updateInstagramSpecAtBreakpoint } from "../contracts/brick/UpdateInstagramSpecAtBreakpointV1";
import { updateLinkSpecAtBreakpointV1 as updateLinkSpecAtBreakpoint } from "../contracts/brick/UpdateLinkSpecAtBreakpointV1";
import { updateMapPlaceSpecAtBreakpointV1 as updateMapPlaceSpecAtBreakpoint } from "../contracts/brick/UpdateMapPlaceSpecAtBreakpointV1";
import { updateSwatchAndIconSpecAtBreakpointV1 as updateSwatchAndIconSpecAtBreakpoint } from "../contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV1";
import { publishSiteV1 as publishSite } from "../contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "../contracts/publishPage/PublishPageV1";
import { publishPageUpdatesV1 as publishPageUpdates } from "../contracts/publishPageUpdates/PublishPageUpdatesV1";
import { Effect } from "effect";
import type { CuidFactory } from "@zerospin/shapes";
import type { IAnyError } from "@zerospin/error";
import { sql } from "drizzle-orm";
import { defineAggregateActor, makeAggregateActorVersion, makeQueryDbVersion } from "@zerospin/sdk";
import { provisionAuthenticatedUser } from "./provisionAuthenticatedUser";
import { RoutePattern } from "@remix-run/route-pattern";
import { makeActorIdentity } from "@zerospin/sdk";
import { userClaims } from "../../../claims";
import { signature } from "../../../signature";
import { userProvisionerV1 } from "./userProvisionerV1";

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

export const userActorV1 = makeAggregateActorVersion(defineAggregateActor({ name: "web" }), {
  version: 1,
  db,
  identity,
  authentication: {
    credentialsSchema: signature,
    authenticate: (props) => {
      const { aggregateId, credentials } = props;
      return userProvisionerV1.authentication.authenticate({ aggregateId, credentials });
    },
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
    const { aggregateId, claims } = props;
    const { default: config } = yield* Effect.promise(() => import("config"));
    const { AggregateChain } = yield* Effect.promise(() => import("system-worker"));
    const chain = yield* AggregateChain.getRepo({
      key: { systemId: config.systemId, aggregateId, aggregateName: "user" },
    });
    yield* provisionAuthenticatedUser({
      chain,
      aggregateId,
      aggregateVersion: 1,
      claims,
    });
  }),

  contracts: {
    addBrick,
    addWallSection,
    movePlacement,
    moveStack,
    deleteBrick,
    updateBrick,
    generateBrickSpec,
    updateArticleSpecAtBreakpoint,
    updateFigmaThumbnailSpecAtBreakpoint,
    updateGithubActivitySpecAtBreakpoint,
    updateGithubProfileSpecAtBreakpoint,
    updateGithubRepoSpecAtBreakpoint,
    updateImageSpecAtBreakpoint,
    updateInstagramSpecAtBreakpoint,
    updateLinkSpecAtBreakpoint,
    updateMapPlaceSpecAtBreakpoint,
    updateSwatchAndIconSpecAtBreakpoint,
    publishSite,
    publishPage,
    publishPageUpdates,
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
