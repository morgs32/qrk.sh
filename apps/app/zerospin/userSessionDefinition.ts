import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV2 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV2";
import { brickV2 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { placementV2 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { pageSnapshotV3 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV3";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV4 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV4";
import { addWallSectionV2 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV2";
import { movePlacementToRowV3 as movePlacementToRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToRowContractV3";
import { movePlacementToNewRowV2 as movePlacementToNewRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewRowContractV2";
import { movePlacementToNewStackV2 as movePlacementToNewStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewStackContractV2";
import { movePlacementToNewSectionV2 as movePlacementToNewSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewSectionContractV2";
import { moveStackV2 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV2";
import { renameStackV2 as renameStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/RenameStackContractV2";
import { deleteBrickV3 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV3";
import { updateBrickV4 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV4";
import { generateBrickSpecV3 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV3";
import { publishSiteV3 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV3";
import { publishPageV3 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV3";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV1";
import { createPageV2 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV2";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/SetBrickBorderWidthV1";
import { setRowWidthWeightsV1 as setRowWidthWeights } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowWidthWeightsV1";
import { setRowMinHeightV1 as setRowMinHeight } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowMinHeightV1";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: 8,
  aggregateVersion: 8,
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
    movePlacementToRow,
    movePlacementToNewRow,
    movePlacementToNewStack,
    movePlacementToNewSection,
    moveStack,
    renameStack,
    deleteBrick,
    updateBrick,
    setBrickBorderWidth,
    setRowWidthWeights,
    setRowMinHeight,
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
