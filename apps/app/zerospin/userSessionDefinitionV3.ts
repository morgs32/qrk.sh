import { makeAggregateSessionDefinition } from "@zerospin/browser";
import { wallV1 as Wall } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV1";
import { sectionV1 as Section } from "@qrk.sh/zerospin/src/aggregates/user/models/section/SectionV1";
import { stackV1 as Stack } from "@qrk.sh/zerospin/src/aggregates/user/models/stack/StackV1";
import { rowV1 as Row } from "@qrk.sh/zerospin/src/aggregates/user/models/row/RowV1";
import { brickV1 as Brick } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { placementV1 as Placement } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV1";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV3";
import { userV1 as User } from "@qrk.sh/zerospin/src/aggregates/user/models/user/UserV1";
import { addBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV1";
import { addWallSection } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV1";
import { movePlacement } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MovePlacementContractV1";
import { moveStack } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV1";
import { deleteBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV1";
import { updateBrick } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV1";
import { generateBrickSpec } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV1";
import { completeBrickSpecGeneration } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV1";
import { configureInstagram } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureInstagramV1";
import { completeInstagram } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteInstagramV1";
import { configureGithubActivity } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubActivityV1";
import { completeGithubActivity } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteGithubActivityV1";
import { configureGithubProfile } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubProfileV1";
import { completeGithubProfile } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteGithubProfileV1";
import { configureGithubRepo } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubRepoV1";
import { completeGithubRepo } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV1";
import { configureFigmaThumbnail } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureFigmaThumbnailV1";
import { completeFigmaThumbnail } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteFigmaThumbnailV1";
import { configureLink } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureLinkV1";
import { completeLink } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteLinkV1";
import { configureMapPlace } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/ConfigureMapPlaceV1";
import { completeMapPlace } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/CompleteMapPlaceV1";
import { updateArticleSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateArticleSpecAtBreakpointV1";
import { updateFigmaThumbnailSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV1";
import { updateGithubActivitySpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubActivitySpecAtBreakpointV1";
import { updateGithubProfileSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubProfileSpecAtBreakpointV1";
import { updateGithubRepoSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateGithubRepoSpecAtBreakpointV1";
import { updateImageSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateImageSpecAtBreakpointV1";
import { updateInstagramSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateInstagramSpecAtBreakpointV1";
import { updateLinkSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateLinkSpecAtBreakpointV1";
import { updateMapPlaceSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateMapPlaceSpecAtBreakpointV1";
import { updateSwatchAndIconSpecAtBreakpoint } from "@qrk.sh/zerospin/src/aggregates/user/contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV1";
import { publishSiteV2 as publishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV2";
import { publishPageUpdatesV2 as publishPageUpdates } from "@qrk.sh/zerospin/src/aggregates/user/contracts/publishPageUpdates/PublishPageUpdatesV2";
import { unpublishSiteV2 as unpublishSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/unpublishSite/UnpublishSiteV2";
import { createPageV3 as createPage } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "@qrk.sh/zerospin/src/aggregates/user/contracts/createSite/CreateSiteV3";
import { updatePageSettingsV3 as updatePageSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "@qrk.sh/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { userClaims } from "@qrk.sh/zerospin/src/claims";

export const userSessionDefinitionV3 = makeAggregateSessionDefinition({
  systemName: "qrk-sh",
  claimsSchema: userClaims,
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: "3.0.0",
  aggregateVersion: "3.0.0",
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
    configureInstagram,
    completeInstagram,
    configureGithubActivity,
    completeGithubActivity,
    configureGithubProfile,
    completeGithubProfile,
    configureGithubRepo,
    completeGithubRepo,
    configureFigmaThumbnail,
    completeFigmaThumbnail,
    configureLink,
    completeLink,
    configureMapPlace,
    completeMapPlace,
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
