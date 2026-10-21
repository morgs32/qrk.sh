import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV1 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV1";
import { sectionV1 as Section } from "@qrk.sh/zerospin/src/aggregates/user/models/section/SectionV1";
import { stackV1 as Stack } from "@qrk.sh/zerospin/src/aggregates/user/models/stack/StackV1";
import { rowV1 as Row } from "@qrk.sh/zerospin/src/aggregates/user/models/row/RowV1";
import { brickV1 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { placementV2 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV3";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV2 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV2";
import { addWallSectionV2 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV2";
import { movePlacementV2 as movePlacement } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementContractV2";
import { moveStackV2 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV2";
import { deleteBrickV2 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV2";
import { updateBrickV3 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV3";
import { generateBrickSpecV2 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV2";
import { completeBrickSpecGenerationV2 as completeBrickSpecGeneration } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV2";
import { updateArticleSpecAtBreakpointV2 as updateArticleSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateArticleSpecAtBreakpointV2";
import { updateFigmaThumbnailSpecAtBreakpointV2 as updateFigmaThumbnailSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV2";
import { updateGithubActivitySpecAtBreakpointV2 as updateGithubActivitySpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubActivitySpecAtBreakpointV2";
import { updateGithubProfileSpecAtBreakpointV2 as updateGithubProfileSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubProfileSpecAtBreakpointV2";
import { updateGithubRepoSpecAtBreakpointV2 as updateGithubRepoSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubRepoSpecAtBreakpointV2";
import { updateImageSpecAtBreakpointV2 as updateImageSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateImageSpecAtBreakpointV2";
import { updateInstagramSpecAtBreakpointV2 as updateInstagramSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateInstagramSpecAtBreakpointV2";
import { updateLinkSpecAtBreakpointV2 as updateLinkSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateLinkSpecAtBreakpointV2";
import { updateMapPlaceSpecAtBreakpointV2 as updateMapPlaceSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateMapPlaceSpecAtBreakpointV2";
import { updateSwatchAndIconSpecAtBreakpointV2 as updateSwatchAndIconSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV2";
import { publishSiteV3 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV3";
import { publishPageV3 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV3";
import { publishPageUpdatesV3 as publishPageUpdates } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPageUpdates/PublishPageUpdatesV3";
import { unpublishSiteV2 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV2";
import { createPageV3 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV3";
import { updatePageSettingsV3 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinition = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: "5.0.0",
  aggregateVersion: "5.0.0",
  models: {
    wall: Wall,
    section: Section,
    stack: Stack,
    row: Row,
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
    generateBrickSpec,
    completeBrickSpecGeneration,
    updateArticleSpecAtBreakpoint,
    updateFigmaThumbnailSpecAtBreakpoint,
    updateGithubActivitySpecAtBreakpoint,
    updateGithubProfileSpecAtBreakpoint,
    updateGithubRepoSpecAtBreakpoint,
    updateImageSpecAtBreakpoint,
    updateInstagramSpecAtBreakpoint,
    updateLinkSpecAtBreakpoint,
    updateMapPlaceSpecAtBreakpoint,
    updateSwatchAndIconSpecAtBreakpoint,
    publishSite,
    publishPage,
    publishPageUpdates,
    unpublishSite,
    createPage,
    createSite,
    updatePageSettings,
    updateSiteSettings,
  },
});
