import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV3 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV3";
import { brickV2 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { placementV2 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { pageSnapshotV4 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV4";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV6 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV6";
import { addWallSectionV3 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV3";
import { movePlacementToRowV5 as movePlacementToRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToRowContractV5";
import { movePlacementToNewRowV4 as movePlacementToNewRow } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewRowContractV4";
import { movePlacementToNewStackV4 as movePlacementToNewStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewStackContractV4";
import { movePlacementToNewSectionV4 as movePlacementToNewSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementToNewSectionContractV4";
import { moveStackV4 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV4";
import { renameStackV3 as renameStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/RenameStackContractV3";
import { deleteBrickV4 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV4";
import { updateBrickV5 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV5";
import { generateBrickSpecV4 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV4";
import { publishSiteV4 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV4";
import { publishPageV4 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV4";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV1";
import { createPageV3 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV3";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV3 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/SetBrickBorderWidthV1";
import { setRowWidthWeightsV2 as setRowWidthWeights } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowWidthWeightsV2";
import { setRowMinHeightV2 as setRowMinHeight } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowMinHeightV2";
import { insertStackV2 as insertStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/InsertStackContractV2";
import { setRowPreferredWidthV1 as setRowPreferredWidth } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowPreferredWidthV1";
import { setRowAlignmentV1 as setRowAlignment } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/SetRowAlignmentV1";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: 10,
  aggregateVersion: 10,
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
