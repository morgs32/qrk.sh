import { makeAggregateVersion } from "@zerospin/sdk";
import { createGridV1 as createGrid } from "./contracts/createGrid/CreateGridV1";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updateGridV1 as updateGrid } from "./contracts/updateGrid/UpdateGridV1";
import { updatePageArticleV1 as updatePageArticle } from "./contracts/updatePageArticle/UpdatePageArticleV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { user } from "./user";
import { userActorV1 } from "./actors/userActorV1";
import { userProvisionerV1 } from "./actors/userProvisionerV1";

export const userAggregateV1 = makeAggregateVersion(user, {
  version: "1.0.0",
  models: {
    brick: Brick,
    grid: Grid,
    page: Page,
    site: Site,
    user: User,
  },
  contracts: {
    createGrid: createGrid,
    createPage: createPage,
    createSite: createSite,
    createUser: createUser,
    updateGrid: updateGrid,
    updatePageArticle: updatePageArticle,
    updatePageSettings: updatePageSettings,
    updateSiteSettings: updateSiteSettings,
  },
  actors: { web: userActorV1, provisioner: userProvisionerV1 },
});
