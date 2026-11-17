import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { brickContracts } from "@qrk.sh/bricks/zerospin/brickContracts";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { wallV1 as Wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import { brickV1 as Brick } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { placementV1 as Placement } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";
import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { siteFailureV1 as SiteFailure } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/fresh/contracts/CreateSiteV1";
import { createPageV1 as createPage } from "@qrk.sh/zerospin/src/fresh/contracts/CreatePageV1";
import { deleteBrickV1 as deleteBrick } from "@qrk.sh/zerospin/src/fresh/contracts/wall/DeleteBrickContractV1";
import { deleteStackV1 as deleteStack } from "@qrk.sh/zerospin/src/fresh/contracts/wall/DeleteStackContractV1";
import { movePlacementToRowV1 as movePlacementToRow } from "@qrk.sh/zerospin/src/fresh/contracts/wall/MovePlacementToRowContractV1";
import { movePlacementToNewRowV1 as movePlacementToNewRow } from "@qrk.sh/zerospin/src/fresh/contracts/wall/MovePlacementToNewRowContractV1";
import { movePlacementToNewStackV1 as movePlacementToNewStack } from "@qrk.sh/zerospin/src/fresh/contracts/wall/MovePlacementToNewStackContractV1";
import { movePlacementToNewSectionV1 as movePlacementToNewSection } from "@qrk.sh/zerospin/src/fresh/contracts/wall/MovePlacementToNewSectionContractV1";
import { moveStackV1 as moveStack } from "@qrk.sh/zerospin/src/fresh/contracts/wall/MoveStackContractV1";
import { insertStackV1 as insertStack } from "@qrk.sh/zerospin/src/fresh/contracts/wall/InsertStackContractV1";
import { publishPageV1 as publishPage } from "@qrk.sh/zerospin/src/fresh/contracts/PublishPageV1";
import { publishSiteV1 as publishSite } from "@qrk.sh/zerospin/src/fresh/contracts/PublishSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/fresh/contracts/UpdatePageSettingsV1";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/fresh/contracts/UnpublishSiteV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "@qrk.sh/zerospin/src/fresh/contracts/UpdateSiteSettingsV1";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "@qrk.sh/zerospin/src/fresh/contracts/SetBrickBorderWidthV1";
import { addWallSectionV1 as addWallSection } from "@qrk.sh/zerospin/src/fresh/contracts/wall/AddWallSectionContractV1";
import { renameStackV1 as renameStack } from "@qrk.sh/zerospin/src/fresh/contracts/wall/RenameStackContractV1";
import { setRowWidthWeightsV1 as setRowWidthWeights } from "@qrk.sh/zerospin/src/fresh/contracts/wall/SetRowWidthWeightsV1";
import { setRowMinHeightV1 as setRowMinHeight } from "@qrk.sh/zerospin/src/fresh/contracts/wall/SetRowMinHeightV1";
import { setRowPreferredWidthV1 as setRowPreferredWidth } from "@qrk.sh/zerospin/src/fresh/contracts/wall/SetRowPreferredWidthV1";
import { setRowAlignmentV1 as setRowAlignment } from "@qrk.sh/zerospin/src/fresh/contracts/wall/SetRowAlignmentV1";
import { setStackWidthWeightsV1 as setStackWidthWeights } from "@qrk.sh/zerospin/src/fresh/contracts/wall/SetStackWidthWeightsV1";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: 1,
  aggregateVersion: 1,
  models: {
    wall: Wall,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
    siteFailure: SiteFailure,
  },
  contracts: {
    createSite,
    createPage,
    deleteBrick,
    deleteStack,
    movePlacementToRow,
    movePlacementToNewRow,
    movePlacementToNewStack,
    movePlacementToNewSection,
    moveStack,
    insertStack,
    publishPage,
    publishSite,
    updatePageSettings,
    unpublishSite,
    updateSiteSettings,
    setBrickBorderWidth,
    addWallSection,
    renameStack,
    setRowWidthWeights,
    setRowMinHeight,
    setRowPreferredWidth,
    setRowAlignment,
    setStackWidthWeights,
    ...brickContracts,
  },
});
