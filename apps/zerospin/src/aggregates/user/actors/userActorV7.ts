import { defineAggregateActor, makeAggregateActorRelease, makeQueryDbVersion } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV6 } from "./userActorV6";
import { wallV2 as Wall } from "../models/wall/WallV2";
import { brickV2 as Brick } from "../models/brick/BrickV2";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV3 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV3";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV4 as addBrick } from "../contracts/wall/AddBrickContractV4";
import { addWallSectionV2 as addWallSection } from "../contracts/wall/AddWallSectionContractV2";
import { movePlacementToRowV3 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV3";
import { movePlacementToNewRowV2 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV2";
import { movePlacementToNewStackV2 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV2";
import { movePlacementToNewSectionV2 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV2";
import { moveStackV2 as moveStack } from "../contracts/wall/MoveStackContractV2";
import { renameStackV2 as renameStack } from "../contracts/wall/RenameStackContractV2";
import { deleteBrickV3 as deleteBrick } from "../contracts/wall/DeleteBrickContractV3";
import { updateBrickV4 as updateBrick } from "../contracts/brick/UpdateBrickV4";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV1";
import { generateBrickSpecV3 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV3";
import { publishSiteV3 as publishSite } from "../contracts/publishSite/PublishSiteV3";
import { publishPageV3 as publishPage } from "../contracts/publishPage/PublishPageV3";
import { updateSiteSettingsV1 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV2 as createPage } from "../contracts/createPage/CreatePageV2";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";

const identity = userActorV6.identity;
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

export const userActorV7 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 7,
  db,
  identity,
  authentication: userActorV6.authentication,
  authorize: userActorV6.authorize,
  exposedModels: {
    wall: Wall,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
  contracts: {
    addBrick,
    addWallSection,
    movePlacementToRow,
    movePlacementToNewRow,
    movePlacementToNewStack,
    movePlacementToNewSection,
    moveStack,
    renameStack,
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
