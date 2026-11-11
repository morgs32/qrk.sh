import { defineAggregateActor, makeAggregateActorRelease, makeQueryDbVersion } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV9 } from "./userActorV9";
import { wallV3 as Wall } from "../models/wall/WallV3";
import { brickV3 as Brick } from "../models/brick/BrickV3";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV5 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV5";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV7 as addBrick } from "../contracts/wall/AddBrickContractV7";
import { addWallSectionV3 as addWallSection } from "../contracts/wall/AddWallSectionContractV3";
import { movePlacementToRowV6 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV6";
import { movePlacementToNewRowV5 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV5";
import { movePlacementToNewStackV5 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV5";
import { movePlacementToNewSectionV5 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV5";
import { moveStackV5 as moveStack } from "../contracts/wall/MoveStackContractV5";
import { renameStackV3 as renameStack } from "../contracts/wall/RenameStackContractV3";
import { deleteBrickV5 as deleteBrick } from "../contracts/wall/DeleteBrickContractV5";
import { updateBrickV7 as updateBrick } from "../contracts/brick/UpdateBrickV7";
import { setBrickBorderWidthV2 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV2";
import { generateBrickSpecV5 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV5";
import { publishSiteV5 as publishSite } from "../contracts/publishSite/PublishSiteV5";
import { publishPageV5 as publishPage } from "../contracts/publishPage/PublishPageV5";
import { updateSiteSettingsV4 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV4";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV3 as createPage } from "../contracts/createPage/CreatePageV3";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";

import { setRowWidthWeightsV2 as setRowWidthWeights } from "../contracts/wall/SetRowWidthWeightsV2";

import { setRowMinHeightV2 as setRowMinHeight } from "../contracts/wall/SetRowMinHeightV2";

import { insertStackV3 as insertStack } from "../contracts/wall/InsertStackContractV3";

import { setRowPreferredWidthV1 as setRowPreferredWidth } from "../contracts/wall/SetRowPreferredWidthV1";

import { setRowAlignmentV1 as setRowAlignment } from "../contracts/wall/SetRowAlignmentV1";

const identity = userActorV9.identity;
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

export const userActorV12 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 12,
  db,
  identity,
  authentication: userActorV9.authentication,
  authorize: userActorV9.authorize,
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
    setRowWidthWeights,
    setRowMinHeight,
    insertStack,
    setRowPreferredWidth,
    setRowAlignment,
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
