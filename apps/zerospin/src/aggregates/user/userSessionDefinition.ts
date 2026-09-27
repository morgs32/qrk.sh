import { userClaims } from "../../claims";
import { makeAggregateSessionDefinition } from "@zerospin/core/aggregateSession/make/makeAggregateSessionDefinition";

import { createGridV1 as createGrid } from "./contracts/createGrid/CreateGridV1";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { updateGridV1 as updateGrid } from "./contracts/updateGrid/UpdateGridV1";
import { updatePageArticleV1 as updatePageArticle } from "./contracts/updatePageArticle/UpdatePageArticleV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";

export const userSessionDefinition = makeAggregateSessionDefinition({
  claimsSchema: userClaims,
  contracts: {
    createGrid: { contract: createGrid },
    createPage: { contract: createPage },
    createSite: { contract: createSite },
    updateGrid: { contract: updateGrid },
    updatePageArticle: { contract: updatePageArticle },
    updatePageSettings: { contract: updatePageSettings },
    updateSiteSettings: { contract: updateSiteSettings },
  },
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: "1.0.0",
  aggregateVersion: "1.0.0",
  models: {
    grid: Grid,
    brick: Brick,
    page: Page,
    site: Site,
    user: User,
  },
});
