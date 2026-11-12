import { defineAggregateActor, makeAggregateActorRelease, makeQueryDbVersion } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV9 } from "./userActorV9";
import { wallV4 as Wall } from "../models/wall/WallV4";
import { brickV5 as Brick } from "../models/brick/BrickV5";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV8 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV8";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV10 as addBrick } from "../contracts/wall/AddBrickContractV10";
import { addWallSectionV4 as addWallSection } from "../contracts/wall/AddWallSectionContractV4";
import { movePlacementToRowV9 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV9";
import { movePlacementToNewRowV8 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV8";
import { movePlacementToNewStackV8 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV8";
import { movePlacementToNewSectionV8 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV8";
import { moveStackV8 as moveStack } from "../contracts/wall/MoveStackContractV8";
import { renameStackV4 as renameStack } from "../contracts/wall/RenameStackContractV4";
import { deleteStackV5 as deleteStack } from "../contracts/wall/DeleteStackContractV5";
import { deleteBrickV8 as deleteBrick } from "../contracts/wall/DeleteBrickContractV8";
import { updateBrickV11 as updateBrick } from "../contracts/brick/UpdateBrickV11";
import { setBrickBorderWidthV4 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV4";
import { generateBrickSpecV8 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV8";
import { publishSiteV8 as publishSite } from "../contracts/publishSite/PublishSiteV8";
import { publishPageV8 as publishPage } from "../contracts/publishPage/PublishPageV8";
import { updateSiteSettingsV7 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV7";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV4 as createPage } from "../contracts/createPage/CreatePageV4";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";

import { setRowWidthWeightsV3 as setRowWidthWeights } from "../contracts/wall/SetRowWidthWeightsV3";

import { setRowMinHeightV3 as setRowMinHeight } from "../contracts/wall/SetRowMinHeightV3";

import { insertStackV6 as insertStack } from "../contracts/wall/InsertStackContractV6";

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

export const userActorV17 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 17,
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
