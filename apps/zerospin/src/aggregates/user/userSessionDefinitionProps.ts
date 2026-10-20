import { wallV1 as Wall } from "./models/wall/WallV1";
import { sectionV1 as Section } from "./models/section/SectionV1";
import { stackV1 as Stack } from "./models/stack/StackV1";
import { rowV1 as Row } from "./models/row/RowV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { placementV1 as Placement } from "./models/placement/PlacementV1";
import { pageV3 as Page } from "./models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "./models/site/SiteV3";
import { userV1 as User } from "./models/user/UserV1";
import { addBrick } from "./contracts/wall/AddBrickContractV1";
import { addWallSection } from "./contracts/wall/AddWallSectionContractV1";
import { movePlacement } from "./contracts/wall/MovePlacementContractV1";
import { moveStack } from "./contracts/wall/MoveStackContractV1";
import { deleteBrick } from "./contracts/wall/DeleteBrickContractV1";
import { updateBrick } from "./contracts/brick/UpdateBrickV1";
import { generateBrickSpec } from "./contracts/brick/GenerateBrickSpecV1";
import { completeBrickSpecGeneration } from "./contracts/brick/GenerateBrickSpecV1";
import { configureInstagram } from "./contracts/brick/ConfigureInstagramV1";
import { completeInstagram } from "./contracts/brick/CompleteInstagramV1";
import { configureGithubActivity } from "./contracts/brick/ConfigureGithubActivityV1";
import { completeGithubActivity } from "./contracts/brick/CompleteGithubActivityV1";
import { configureGithubProfile } from "./contracts/brick/ConfigureGithubProfileV1";
import { completeGithubProfile } from "./contracts/brick/CompleteGithubProfileV1";
import { configureGithubRepo } from "./contracts/brick/ConfigureGithubRepoV1";
import { completeGithubRepo } from "./contracts/brick/CompleteGithubRepoV1";
import { configureFigmaThumbnail } from "./contracts/brick/ConfigureFigmaThumbnailV1";
import { completeFigmaThumbnail } from "./contracts/brick/CompleteFigmaThumbnailV1";
import { configureLink } from "./contracts/brick/ConfigureLinkV1";
import { completeLink } from "./contracts/brick/CompleteLinkV1";
import { configureMapPlace } from "./contracts/brick/ConfigureMapPlaceV1";
import { completeMapPlace } from "./contracts/brick/CompleteMapPlaceV1";
import { updateArticleSpecAtBreakpoint } from "./contracts/brick/UpdateArticleSpecAtBreakpointV1";
import { updateFigmaThumbnailSpecAtBreakpoint } from "./contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV1";
import { updateGithubActivitySpecAtBreakpoint } from "./contracts/brick/UpdateGithubActivitySpecAtBreakpointV1";
import { updateGithubProfileSpecAtBreakpoint } from "./contracts/brick/UpdateGithubProfileSpecAtBreakpointV1";
import { updateGithubRepoSpecAtBreakpoint } from "./contracts/brick/UpdateGithubRepoSpecAtBreakpointV1";
import { updateImageSpecAtBreakpoint } from "./contracts/brick/UpdateImageSpecAtBreakpointV1";
import { updateInstagramSpecAtBreakpoint } from "./contracts/brick/UpdateInstagramSpecAtBreakpointV1";
import { updateLinkSpecAtBreakpoint } from "./contracts/brick/UpdateLinkSpecAtBreakpointV1";
import { updateMapPlaceSpecAtBreakpoint } from "./contracts/brick/UpdateMapPlaceSpecAtBreakpointV1";
import { updateSwatchAndIconSpecAtBreakpoint } from "./contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV1";
import { publishSiteV2 as publishSite } from "./contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "./contracts/publishPage/PublishPageV2";
import { publishPageUpdatesV2 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV2";
import { unpublishSiteV2 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV2";
import { createPageV3 as createPage } from "./contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "./contracts/createSite/CreateSiteV3";
import { updatePageSettingsV3 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { userClaims } from "../../claims";

export const userSessionDefinitionProps = {
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
};
