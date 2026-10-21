import { wallV1 as Wall } from "./models/wall/WallV1";
import { sectionV1 as Section } from "./models/section/SectionV1";
import { stackV1 as Stack } from "./models/stack/StackV1";
import { rowV1 as Row } from "./models/row/RowV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV3 as Page } from "./models/page/PageV3";
import { pageSnapshotV2 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV2";
import { siteV3 as Site } from "./models/site/SiteV3";
import { userV1 as User } from "./models/user/UserV1";
import { addBrickV2 as addBrick } from "./contracts/wall/AddBrickContractV2";
import { addWallSectionV2 as addWallSection } from "./contracts/wall/AddWallSectionContractV2";
import { movePlacementV2 as movePlacement } from "./contracts/wall/MovePlacementContractV2";
import { moveStackV2 as moveStack } from "./contracts/wall/MoveStackContractV2";
import { deleteBrickV2 as deleteBrick } from "./contracts/wall/DeleteBrickContractV2";
import { updateBrickV3 as updateBrick } from "./contracts/brick/UpdateBrickV3";
import { generateBrickSpecV2 as generateBrickSpec } from "./contracts/brick/GenerateBrickSpecV2";
import { completeBrickSpecGenerationV2 as completeBrickSpecGeneration } from "./contracts/brick/GenerateBrickSpecV2";
import { configureInstagramV2 as configureInstagram } from "./contracts/brick/ConfigureInstagramV2";
import { completeInstagramV2 as completeInstagram } from "./contracts/brick/CompleteInstagramV2";
import { configureGithubActivityV2 as configureGithubActivity } from "./contracts/brick/ConfigureGithubActivityV2";
import { completeGithubActivityV2 as completeGithubActivity } from "./contracts/brick/CompleteGithubActivityV2";
import { configureGithubProfileV2 as configureGithubProfile } from "./contracts/brick/ConfigureGithubProfileV2";
import { completeGithubProfileV2 as completeGithubProfile } from "./contracts/brick/CompleteGithubProfileV2";
import { configureGithubRepoV2 as configureGithubRepo } from "./contracts/brick/ConfigureGithubRepoV2";
import { completeGithubRepoV2 as completeGithubRepo } from "./contracts/brick/CompleteGithubRepoV2";
import { configureFigmaThumbnailV2 as configureFigmaThumbnail } from "./contracts/brick/ConfigureFigmaThumbnailV2";
import { completeFigmaThumbnailV2 as completeFigmaThumbnail } from "./contracts/brick/CompleteFigmaThumbnailV2";
import { configureLinkV2 as configureLink } from "./contracts/brick/ConfigureLinkV2";
import { completeLinkV2 as completeLink } from "./contracts/brick/CompleteLinkV2";
import { configureMapPlaceV2 as configureMapPlace } from "./contracts/brick/ConfigureMapPlaceV2";
import { completeMapPlaceV2 as completeMapPlace } from "./contracts/brick/CompleteMapPlaceV2";
import { updateArticleSpecAtBreakpointV2 as updateArticleSpecAtBreakpoint } from "./contracts/brick/UpdateArticleSpecAtBreakpointV2";
import { updateFigmaThumbnailSpecAtBreakpointV2 as updateFigmaThumbnailSpecAtBreakpoint } from "./contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV2";
import { updateGithubActivitySpecAtBreakpointV2 as updateGithubActivitySpecAtBreakpoint } from "./contracts/brick/UpdateGithubActivitySpecAtBreakpointV2";
import { updateGithubProfileSpecAtBreakpointV2 as updateGithubProfileSpecAtBreakpoint } from "./contracts/brick/UpdateGithubProfileSpecAtBreakpointV2";
import { updateGithubRepoSpecAtBreakpointV2 as updateGithubRepoSpecAtBreakpoint } from "./contracts/brick/UpdateGithubRepoSpecAtBreakpointV2";
import { updateImageSpecAtBreakpointV2 as updateImageSpecAtBreakpoint } from "./contracts/brick/UpdateImageSpecAtBreakpointV2";
import { updateInstagramSpecAtBreakpointV2 as updateInstagramSpecAtBreakpoint } from "./contracts/brick/UpdateInstagramSpecAtBreakpointV2";
import { updateLinkSpecAtBreakpointV2 as updateLinkSpecAtBreakpoint } from "./contracts/brick/UpdateLinkSpecAtBreakpointV2";
import { updateMapPlaceSpecAtBreakpointV2 as updateMapPlaceSpecAtBreakpoint } from "./contracts/brick/UpdateMapPlaceSpecAtBreakpointV2";
import { updateSwatchAndIconSpecAtBreakpointV2 as updateSwatchAndIconSpecAtBreakpoint } from "./contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV2";
import { publishSiteV3 as publishSite } from "./contracts/publishSite/PublishSiteV3";
import { publishPageV3 as publishPage } from "./contracts/publishPage/PublishPageV3";
import { publishPageUpdatesV3 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV3";
import { unpublishSiteV2 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV2";
import { createPageV3 as createPage } from "./contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "./contracts/createSite/CreateSiteV3";
import { updatePageSettingsV3 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { Effect } from "effect";
import { findFirst } from "@zerospin/sdk/browser";
import { makeAggregateRelease } from "@zerospin/sdk";
import { scopeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { user } from "./user";
import { userActorV5 } from "./actors/userActorV5";
import { userProvisionerV1 } from "./actors/userProvisionerV1";

export const userAggregateV5 = makeAggregateRelease(user, {
  version: "5.0.0",
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
    // Historical operations remain available to replay admitted history, not to web callers.
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
    createUser,
  },
  actors: { web: userActorV5, provisioner: userProvisionerV1 },
  guards: {
    provisioner: {
      createUser: (props) => {
        const { db, claims, payload, failures } = props;
        return Effect.gen(function* () {
          if (payload.clerkUserId !== claims.clerkUserId) {
            return yield* failures.createUserIdentityMismatch.make({
              message: `User ${payload.id} does not match authenticated identity ${claims.clerkUserId}`,
              status: 403,
            });
          }
          const existingUser = yield* findFirst({
            db: scopeContractReadDb(db, createUser.models),
            model: User,
            where: { clerkUserId: { eq: payload.clerkUserId } },
          });
          if (existingUser !== undefined) {
            return yield* failures.userAlreadyExists.make({
              message: `A user already exists for Clerk user ${payload.clerkUserId}`,
              status: 409,
            });
          }
        });
      },
    },
  },
});
