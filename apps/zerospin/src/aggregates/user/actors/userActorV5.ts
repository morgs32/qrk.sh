import { updateSiteSettingsV3 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { updatePageSettingsV3 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV3";
import { createSiteV3 as createSite } from "../contracts/createSite/CreateSiteV3";
import { createPageV3 as createPage } from "../contracts/createPage/CreatePageV3";
import { unpublishSiteV2 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV2";
import { wallV1 as Wall } from "../models/wall/WallV1";
import { sectionV1 as Section } from "../models/section/SectionV1";
import { stackV1 as Stack } from "../models/stack/StackV1";
import { rowV1 as Row } from "../models/row/RowV1";
import { brickV1 as Brick } from "../models/brick/BrickV1";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV3 as Page } from "../models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "../models/site/SiteV3";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV2 as addBrick } from "../contracts/wall/AddBrickContractV2";
import { addWallSectionV2 as addWallSection } from "../contracts/wall/AddWallSectionContractV2";
import { movePlacementV2 as movePlacement } from "../contracts/wall/MovePlacementContractV2";
import { moveStackV2 as moveStack } from "../contracts/wall/MoveStackContractV2";
import { deleteBrickV2 as deleteBrick } from "../contracts/wall/DeleteBrickContractV2";
import { updateBrickV3 as updateBrick } from "../contracts/brick/UpdateBrickV3";
import { generateBrickSpecV2 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV2";
import { completeBrickSpecGenerationV2 as completeBrickSpecGeneration } from "../contracts/brick/GenerateBrickSpecV2";
import { updateArticleSpecAtBreakpointV2 as updateArticleSpecAtBreakpoint } from "../contracts/brick/UpdateArticleSpecAtBreakpointV2";
import { updateFigmaThumbnailSpecAtBreakpointV2 as updateFigmaThumbnailSpecAtBreakpoint } from "../contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV2";
import { updateGithubActivitySpecAtBreakpointV2 as updateGithubActivitySpecAtBreakpoint } from "../contracts/brick/UpdateGithubActivitySpecAtBreakpointV2";
import { updateGithubProfileSpecAtBreakpointV2 as updateGithubProfileSpecAtBreakpoint } from "../contracts/brick/UpdateGithubProfileSpecAtBreakpointV2";
import { updateGithubRepoSpecAtBreakpointV2 as updateGithubRepoSpecAtBreakpoint } from "../contracts/brick/UpdateGithubRepoSpecAtBreakpointV2";
import { updateImageSpecAtBreakpointV2 as updateImageSpecAtBreakpoint } from "../contracts/brick/UpdateImageSpecAtBreakpointV2";
import { updateInstagramSpecAtBreakpointV2 as updateInstagramSpecAtBreakpoint } from "../contracts/brick/UpdateInstagramSpecAtBreakpointV2";
import { updateLinkSpecAtBreakpointV2 as updateLinkSpecAtBreakpoint } from "../contracts/brick/UpdateLinkSpecAtBreakpointV2";
import { updateMapPlaceSpecAtBreakpointV2 as updateMapPlaceSpecAtBreakpoint } from "../contracts/brick/UpdateMapPlaceSpecAtBreakpointV2";
import { updateSwatchAndIconSpecAtBreakpointV2 as updateSwatchAndIconSpecAtBreakpoint } from "../contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV2";
import { publishSiteV3 as publishSite } from "../contracts/publishSite/PublishSiteV3";
import { publishPageV3 as publishPage } from "../contracts/publishPage/PublishPageV3";
import { publishPageUpdatesV3 as publishPageUpdates } from "../contracts/publishPageUpdates/PublishPageUpdatesV3";
import { Effect } from "effect";
import type { CuidFactory } from "@zerospin/shapes";
import type { IAnyError } from "@zerospin/error";
import { sql } from "drizzle-orm";
import { defineAggregateActor, makeAggregateActorVersion, makeQueryDbVersion } from "@zerospin/sdk";
import { provisionAuthenticatedUser } from "./provisionAuthenticatedUser";
import { userActorV4 } from "./userActorV4";

const identity = userActorV4.identity;
const db = makeQueryDbVersion({
  models: {
    wall: Wall,
    section: Section,
    stack: Stack,
    row: Row,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
});

export const userActorV5 = makeAggregateActorVersion(defineAggregateActor({ name: "web" }), {
  version: "5.0.0",
  db,
  identity,
  authentication: userActorV4.authentication,
  exposedModels: {
    wall: Wall,
    section: Section,
    stack: Stack,
    row: Row,
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
      aggregateVersion: "5.0.0",
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
    completeBrickSpecGeneration,
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
    section: db.query.section.findMany({
      where: {
        wall: {
          page: {
            site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
          },
        },
      },
    }),
    stack: db.query.stack.findMany({
      where: {
        section: {
          wall: {
            page: {
              site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
            },
          },
        },
      },
    }),
    row: db.query.row.findMany({
      where: {
        stack: {
          section: {
            wall: {
              page: {
                site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
              },
            },
          },
        },
      },
    }),
    brick: db.query.brick.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    placement: db.query.placement.findMany({
      where: {
        row: {
          stack: {
            section: {
              wall: {
                page: {
                  site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
                },
              },
            },
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
