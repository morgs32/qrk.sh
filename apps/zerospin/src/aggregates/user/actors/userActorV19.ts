import { defineAggregateActor, makeAggregateActorRelease, makeQueryDbVersion } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV9 } from "./userActorV9";
import { wallV4 as Wall } from "../models/wall/WallV4";
import { brickV6 as Brick } from "../models/brick/BrickV6";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV9 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV9";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV12 as addBrick } from "../contracts/wall/AddBrickContractV12";
import { addWallSectionV4 as addWallSection } from "../contracts/wall/AddWallSectionContractV4";
import { movePlacementToRowV10 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV10";
import { movePlacementToNewRowV9 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV9";
import { movePlacementToNewStackV9 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV9";
import { movePlacementToNewSectionV9 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV9";
import { moveStackV9 as moveStack } from "../contracts/wall/MoveStackContractV9";
import { renameStackV4 as renameStack } from "../contracts/wall/RenameStackContractV4";
import { deleteStackV6 as deleteStack } from "../contracts/wall/DeleteStackContractV6";
import { deleteBrickV9 as deleteBrick } from "../contracts/wall/DeleteBrickContractV9";
import { updateBrickV13 as updateBrick } from "../contracts/brick/UpdateBrickV13";
import { setBrickBorderWidthV5 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV5";
import { generateBrickSpecV9 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV9";
import { publishSiteV9 as publishSite } from "../contracts/publishSite/PublishSiteV9";
import { publishPageV9 as publishPage } from "../contracts/publishPage/PublishPageV9";
import { updateSiteSettingsV8 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV8";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV4 as createPage } from "../contracts/createPage/CreatePageV4";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";

import { setRowWidthWeightsV3 as setRowWidthWeights } from "../contracts/wall/SetRowWidthWeightsV3";

import { setRowMinHeightV3 as setRowMinHeight } from "../contracts/wall/SetRowMinHeightV3";

import { insertStackV7 as insertStack } from "../contracts/wall/InsertStackContractV7";

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

export const userActorV19 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 19,
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
