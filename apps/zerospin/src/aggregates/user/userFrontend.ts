import { RoutePattern } from "@remix-run/route-pattern";
import { Schema } from "effect";
import { signature } from "../../signature";
import { makeFrontendController } from "@zerospin/sdk/browser";

import { createGridV2 as createGrid } from "./contracts/createGrid/CreateGridV2";
import { createPageV2 as createPage } from "./contracts/createPage/CreatePageV2";
import { createSiteV2 as createSite } from "./contracts/createSite/CreateSiteV2";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updateGridV2 as updateGrid } from "./contracts/updateGrid/UpdateGridV2";
import { updatePageArticleV1 as updatePageArticle } from "./contracts/updatePageArticle/UpdatePageArticleV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { pageV2 as Page } from "./models/page/PageV2";
import { siteV2 as Site } from "./models/site/SiteV2";
import { userV1 as User } from "./models/user/UserV1";

export const userFrontend = makeFrontendController({
  authentication: {
    signatureSchema: signature,
    authenticationSchema: Schema.Struct({ aggregateId: Schema.String, clerkUserId: Schema.String }),
    selectionSchema: Schema.Struct({ clerkUserId: Schema.String }),
    pattern: RoutePattern.parse("/:clerkUserId"),
  },
  contracts: {
    createGrid: { contract: createGrid },
    createPage: { contract: createPage },
    createSite: { contract: createSite },
    createUser: { contract: createUser },
    updateGrid: { contract: updateGrid },
    updatePageArticle: { contract: updatePageArticle },
    updatePageSettings: { contract: updatePageSettings },
    updateSiteSettings: { contract: updateSiteSettings },
  },
  aggregateName: "user",
  name: "web",
  aggregateVersion: "8.0.0",
  systemName: "qrk-sh",
  models: {
    grid: Grid,
    brick: Brick,
    page: Page,
    site: Site,
    user: User,
  },
});
