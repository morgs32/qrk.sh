import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV1 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV1";
import { sectionV1 as Section } from "@qrk.sh/zerospin/src/aggregates/user/models/section/SectionV1";
import { stackV1 as Stack } from "@qrk.sh/zerospin/src/aggregates/user/models/stack/StackV1";
import { rowV1 as Row } from "@qrk.sh/zerospin/src/aggregates/user/models/row/RowV1";
import { brickV1 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { placementV1 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrickV1 as addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV1";
import { addWallSectionV1 as addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV1";
import { movePlacementV1 as movePlacement } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementContractV1";
import { moveStackV1 as moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV1";
import { deleteBrickV1 as deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV1";
import { updateBrickV1 as updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV1";
import { generateBrickSpecV1 as generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV1";
import { completeBrickSpecGenerationV1 as completeBrickSpecGeneration } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV1";
import { updateArticleSpecAtBreakpointV1 as updateArticleSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateArticleSpecAtBreakpointV1";
import { updateFigmaThumbnailSpecAtBreakpointV1 as updateFigmaThumbnailSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV1";
import { updateGithubActivitySpecAtBreakpointV1 as updateGithubActivitySpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubActivitySpecAtBreakpointV1";
import { updateGithubProfileSpecAtBreakpointV1 as updateGithubProfileSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubProfileSpecAtBreakpointV1";
import { updateGithubRepoSpecAtBreakpointV1 as updateGithubRepoSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubRepoSpecAtBreakpointV1";
import { updateImageSpecAtBreakpointV1 as updateImageSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateImageSpecAtBreakpointV1";
import { updateInstagramSpecAtBreakpointV1 as updateInstagramSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateInstagramSpecAtBreakpointV1";
import { updateLinkSpecAtBreakpointV1 as updateLinkSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateLinkSpecAtBreakpointV1";
import { updateMapPlaceSpecAtBreakpointV1 as updateMapPlaceSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateMapPlaceSpecAtBreakpointV1";
import { updateSwatchAndIconSpecAtBreakpointV1 as updateSwatchAndIconSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV1";
import { publishSiteV1 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV1";
import { publishPageUpdatesV1 as publishPageUpdates } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPageUpdates/PublishPageUpdatesV1";
import { unpublishSiteV1 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV1";
import { createPageV1 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

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
