import { makeFrontendController } from "@zerospin/sdk/browser";

import { createGridV1 as createGrid } from "./contracts/createGrid/CreateGridV1";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updateGridV1 as updateGrid } from "./contracts/updateGrid/UpdateGridV1";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";

export const userFrontend = makeFrontendController({
  contracts: {
    createGrid: { contract: createGrid },
    createPage: { contract: createPage },
    createSite: { contract: createSite },
    createUser: { contract: createUser },
    updateGrid: { contract: updateGrid },
  },
  aggregateName: "user",
  name: "web",
  aggregateVersion: "3.0.0",
  systemName: "qrk-sh",
  models: {
    grid: Grid,
    brick: Brick,
    page: Page,
    site: Site,
    user: User,
  },
});
