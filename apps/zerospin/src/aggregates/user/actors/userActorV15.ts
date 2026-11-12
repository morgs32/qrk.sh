import { defineAggregateActor, makeAggregateActorRelease, makeQueryDbVersion } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV9 } from "./userActorV9";
import { wallV3 as Wall } from "../models/wall/WallV3";
import { brickV4 as Brick } from "../models/brick/BrickV4";
import { placementV2 as Placement } from "../models/placement/PlacementV2";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV6 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV6";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV8 as addBrick } from "../contracts/wall/AddBrickContractV8";
import { addWallSectionV3 as addWallSection } from "../contracts/wall/AddWallSectionContractV3";
import { movePlacementToRowV7 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV7";
import { movePlacementToNewRowV6 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV6";
import { movePlacementToNewStackV6 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV6";
import { movePlacementToNewSectionV6 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV6";
import { moveStackV6 as moveStack } from "../contracts/wall/MoveStackContractV6";
import { renameStackV3 as renameStack } from "../contracts/wall/RenameStackContractV3";
import { deleteStackV3 as deleteStack } from "../contracts/wall/DeleteStackContractV3";
import { deleteBrickV6 as deleteBrick } from "../contracts/wall/DeleteBrickContractV6";
import { updateBrickV9 as updateBrick } from "../contracts/brick/UpdateBrickV9";
import { setBrickBorderWidthV3 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV3";
import { generateBrickSpecV6 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV6";
import { publishSiteV6 as publishSite } from "../contracts/publishSite/PublishSiteV6";
import { publishPageV6 as publishPage } from "../contracts/publishPage/PublishPageV6";
import { updateSiteSettingsV5 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV5";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV3 as createPage } from "../contracts/createPage/CreatePageV3";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";

import { setRowWidthWeightsV2 as setRowWidthWeights } from "../contracts/wall/SetRowWidthWeightsV2";

import { setRowMinHeightV2 as setRowMinHeight } from "../contracts/wall/SetRowMinHeightV2";

import { insertStackV4 as insertStack } from "../contracts/wall/InsertStackContractV4";

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

export const userActorV15 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 15,
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
