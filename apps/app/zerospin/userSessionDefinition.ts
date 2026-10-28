import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV1 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV1";
import { brickV2 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { placementV1 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { pageSnapshotV2 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV2";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV2 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV2";
import { addWallSectionV1 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV1";
import { movePlacementV2 as movePlacement } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementContractV2";
import { moveStackV1 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV1";
import { deleteBrickV2 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV2";
import { updateBrickV2 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV2";
import { generateBrickSpecV2 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV2";
import { publishSiteV2 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV2";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV1";
import { createPageV1 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/SetBrickBorderWidthV1";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: 2,
  aggregateVersion: 2,
  models: {
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
    movePlacement,
    moveStack,
    deleteBrick,
    updateBrick,
    setBrickBorderWidth,
    generateBrickSpec,
    publishSite,
    publishPage,
    unpublishSite,
    createPage,
    createSite,
    updatePageSettings,
    updateSiteSettings,
  },
});
