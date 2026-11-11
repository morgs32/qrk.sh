import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV3 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV3";
import { brickV3 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV3";
import { placementV2 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { pageSnapshotV5 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV5";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV7 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV7";
import { addWallSectionV3 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV3";
import { movePlacementToRowV6 as movePlacementToRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToRowContractV6";
import { movePlacementToNewRowV5 as movePlacementToNewRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewRowContractV5";
import { movePlacementToNewStackV5 as movePlacementToNewStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewStackContractV5";
import { movePlacementToNewSectionV5 as movePlacementToNewSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewSectionContractV5";
import { moveStackV5 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV5";
import { renameStackV3 as renameStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/RenameStackContractV3";
import { deleteBrickV5 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV5";
import { updateBrickV7 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV7";
import { generateBrickSpecV5 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV5";
import { publishSiteV5 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV5";
import { publishPageV5 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV5";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV1";
import { createPageV3 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV3";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV4 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV4";
import { setBrickBorderWidthV2 as setBrickBorderWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/SetBrickBorderWidthV2";
import { setRowWidthWeightsV2 as setRowWidthWeights } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowWidthWeightsV2";
import { setRowMinHeightV2 as setRowMinHeight } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowMinHeightV2";
import { insertStackV3 as insertStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/InsertStackContractV3";
import { setRowPreferredWidthV1 as setRowPreferredWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowPreferredWidthV1";
import { setRowAlignmentV1 as setRowAlignment } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowAlignmentV1";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: 12,
  aggregateVersion: 12,
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
    insertStack,
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
    setRowPreferredWidth,
    setRowAlignment,
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
