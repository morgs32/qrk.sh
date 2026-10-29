import { makeQueryDbVersion, updateAggregateActorRelease } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { userActorV1 } from "./userActorV1";
import { wallV1 as Wall } from "../models/wall/WallV1";
import { brickV2 as Brick } from "../models/brick/BrickV2";
import { placementV1 as Placement } from "../models/placement/PlacementV1";
import { pageV1 as Page } from "../models/page/PageV1";
import { pageSnapshotV2 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV2";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";
import { addBrickV2 as addBrick } from "../contracts/wall/AddBrickContractV2";
import { movePlacementV2 as movePlacement } from "../contracts/wall/MovePlacementContractV2";
import { deleteBrickV2 as deleteBrick } from "../contracts/wall/DeleteBrickContractV2";
import { updateBrickV2 as updateBrick } from "../contracts/brick/UpdateBrickV2";
import { generateBrickSpecV2 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV2";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV1";
import { publishSiteV2 as publishSite } from "../contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "../contracts/publishPage/PublishPageV2";

const identity = userActorV1.identity;
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

export const userActorV2 = updateAggregateActorRelease(userActorV1, {
  version: 2,
  db,
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
    movePlacement,
    deleteBrick,
    updateBrick,
    generateBrickSpec,
    setBrickBorderWidth,
    publishSite,
    publishPage,
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
