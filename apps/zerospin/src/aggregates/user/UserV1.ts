import { wallV1 as Wall } from "./models/wall/WallV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { placementV1 as Placement } from "./models/placement/PlacementV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV1 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { addBrickV1 as addBrick } from "./contracts/wall/AddBrickContractV1";
import { addWallSectionV1 as addWallSection } from "./contracts/wall/AddWallSectionContractV1";
import { movePlacementV1 as movePlacement } from "./contracts/wall/MovePlacementContractV1";
import { moveStackV1 as moveStack } from "./contracts/wall/MoveStackContractV1";
import { deleteBrickV1 as deleteBrick } from "./contracts/wall/DeleteBrickContractV1";
import { updateBrickV1 as updateBrick } from "./contracts/brick/UpdateBrickV1";
import { generateBrickSpecServerV1 as generateBrickSpec } from "./contracts/brick/GenerateBrickSpecServerV1";
import { generateBrickSpecExternalV1 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV1";
import { updateArticleSpecAtBreakpointV1 as updateArticleSpecAtBreakpoint } from "./contracts/brick/UpdateArticleSpecAtBreakpointV1";
import { updateFigmaThumbnailSpecAtBreakpointV1 as updateFigmaThumbnailSpecAtBreakpoint } from "./contracts/brick/UpdateFigmaThumbnailSpecAtBreakpointV1";
import { updateGithubActivitySpecAtBreakpointV1 as updateGithubActivitySpecAtBreakpoint } from "./contracts/brick/UpdateGithubActivitySpecAtBreakpointV1";
import { updateGithubProfileSpecAtBreakpointV1 as updateGithubProfileSpecAtBreakpoint } from "./contracts/brick/UpdateGithubProfileSpecAtBreakpointV1";
import { updateGithubRepoSpecAtBreakpointV1 as updateGithubRepoSpecAtBreakpoint } from "./contracts/brick/UpdateGithubRepoSpecAtBreakpointV1";
import { updateImageSpecAtBreakpointV1 as updateImageSpecAtBreakpoint } from "./contracts/brick/UpdateImageSpecAtBreakpointV1";
import { updateInstagramSpecAtBreakpointV1 as updateInstagramSpecAtBreakpoint } from "./contracts/brick/UpdateInstagramSpecAtBreakpointV1";
import { updateLinkSpecAtBreakpointV1 as updateLinkSpecAtBreakpoint } from "./contracts/brick/UpdateLinkSpecAtBreakpointV1";
import { updateMapPlaceSpecAtBreakpointV1 as updateMapPlaceSpecAtBreakpoint } from "./contracts/brick/UpdateMapPlaceSpecAtBreakpointV1";
import { updateSwatchAndIconSpecAtBreakpointV1 as updateSwatchAndIconSpecAtBreakpoint } from "./contracts/brick/UpdateSwatchAndIconSpecAtBreakpointV1";
import { publishSiteV1 as publishSite } from "./contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "./contracts/publishPage/PublishPageV1";
import { publishPageUpdatesV1 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV1";
import { unpublishSiteV1 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV1";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { Effect } from "effect";
import { findFirst } from "@zerospin/sdk/browser";
import { makeAggregateRelease } from "@zerospin/sdk";
import { scopeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { user } from "./user";
import { userActorV1 } from "./actors/userActorV1";
import { userProvisionerV1 } from "./actors/userProvisionerV1";

export const userAggregateV1 = makeAggregateRelease(user, {
  version: 1,
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
    movePlacement,
    moveStack,
    deleteBrick,
    updateBrick,
    generateBrickSpec,
    generateBrickSpecExternal,
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
  actors: { web: userActorV1, provisioner: userProvisionerV1 },
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
