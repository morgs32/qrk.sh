import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV4 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV4";
import { brickV6 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV6";
import { placementV2 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { pageSnapshotV9 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV9";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV13 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV13";
import { addWallSectionV4 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV4";
import { movePlacementToRowV10 as movePlacementToRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToRowContractV10";
import { movePlacementToNewRowV9 as movePlacementToNewRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewRowContractV9";
import { movePlacementToNewStackV9 as movePlacementToNewStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewStackContractV9";
import { movePlacementToNewSectionV9 as movePlacementToNewSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewSectionContractV9";
import { moveStackV9 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV9";
import { renameStackV4 as renameStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/RenameStackContractV4";
import { deleteBrickV9 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV9";
import { deleteStackV6 as deleteStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteStackContractV6";
import { updateBrickV14 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV14";
import { generateBrickSpecV9 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV9";
import { publishSiteV9 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV9";
import { publishPageV9 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV9";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV1";
import { createPageV4 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV4";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV8 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV8";
import { setBrickBorderWidthV5 as setBrickBorderWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/SetBrickBorderWidthV5";
import { setRowWidthWeightsV3 as setRowWidthWeights } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowWidthWeightsV3";
import { setRowMinHeightV3 as setRowMinHeight } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowMinHeightV3";
import { insertStackV7 as insertStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/InsertStackContractV7";
import { setRowPreferredWidthV2 as setRowPreferredWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowPreferredWidthV2";
import { setRowAlignmentV2 as setRowAlignment } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowAlignmentV2";
import { setStackWidthWeightsV1 as setStackWidthWeights } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetStackWidthWeightsV1";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: 20,
  aggregateVersion: 20,
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
    deleteStack,
    updateBrick,
    setBrickBorderWidth,
    setRowWidthWeights,
    setStackWidthWeights,
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
