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
import { generateBrickSpecV1 as generateBrickSpec } from "./contracts/brick/GenerateBrickSpecV1";
import { generateBrickSpecExternalV1 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV1";
import { publishSiteV1 as publishSite } from "./contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "./contracts/publishPage/PublishPageV1";
import { unpublishSiteV1 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV1";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { makeAggregateRelease } from "@zerospin/sdk";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { user } from "./user";
import { userActorV1 } from "./actors/userActorV1";

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
    publishSite,
    publishPage,
    unpublishSite,
    createPage,
    createSite,
    updatePageSettings,
    updateSiteSettings,
    createUser,
  },
  actors: { web: userActorV1 },
});
