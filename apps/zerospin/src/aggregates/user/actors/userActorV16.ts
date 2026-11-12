import { defineAggregateActor, makeAggregateActorRelease, makeQueryDbVersion } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV9 } from "./userActorV9";
import { wallV4 as Wall } from "../models/wall/WallV4";
import { brickV4 as Brick } from "../models/brick/BrickV4";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV7 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV7";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV9 as addBrick } from "../contracts/wall/AddBrickContractV9";
import { addWallSectionV4 as addWallSection } from "../contracts/wall/AddWallSectionContractV4";
import { movePlacementToRowV8 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV8";
import { movePlacementToNewRowV7 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV7";
import { movePlacementToNewStackV7 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV7";
import { movePlacementToNewSectionV7 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV7";
import { moveStackV7 as moveStack } from "../contracts/wall/MoveStackContractV7";
import { renameStackV4 as renameStack } from "../contracts/wall/RenameStackContractV4";
import { deleteStackV4 as deleteStack } from "../contracts/wall/DeleteStackContractV4";
import { deleteBrickV7 as deleteBrick } from "../contracts/wall/DeleteBrickContractV7";
import { updateBrickV10 as updateBrick } from "../contracts/brick/UpdateBrickV10";
import { setBrickBorderWidthV3 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV3";
import { generateBrickSpecV7 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV7";
import { publishSiteV7 as publishSite } from "../contracts/publishSite/PublishSiteV7";
import { publishPageV7 as publishPage } from "../contracts/publishPage/PublishPageV7";
import { updateSiteSettingsV6 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV6";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV4 as createPage } from "../contracts/createPage/CreatePageV4";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";

import { setRowWidthWeightsV3 as setRowWidthWeights } from "../contracts/wall/SetRowWidthWeightsV3";

import { setRowMinHeightV3 as setRowMinHeight } from "../contracts/wall/SetRowMinHeightV3";

import { insertStackV5 as insertStack } from "../contracts/wall/InsertStackContractV5";

import { setRowPreferredWidthV2 as setRowPreferredWidth } from "../contracts/wall/SetRowPreferredWidthV2";

import { setRowAlignmentV2 as setRowAlignment } from "../contracts/wall/SetRowAlignmentV2";

import { setStackWidthWeightsV1 as setStackWidthWeights } from "../contracts/wall/SetStackWidthWeightsV1";

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

export const userActorV16 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 16,
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
    setStackWidthWeights,
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
    deleteStack,
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
