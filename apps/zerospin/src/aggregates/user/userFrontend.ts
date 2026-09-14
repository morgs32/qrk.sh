import { RoutePattern } from "@remix-run/route-pattern";
import { Schema } from "effect";
import { signature } from "../../signature";
import { makeFrontendController } from "@zerospin/sdk/browser";

import { createGridV2 as createGrid } from "./contracts/createGrid/CreateGridV2";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV2 as createSite } from "./contracts/createSite/CreateSiteV2";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updateGridV2 as updateGrid } from "./contracts/updateGrid/UpdateGridV2";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
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
  },
  aggregateName: "user",
  name: "web",
  aggregateVersion: "5.0.0",
  systemName: "qrk-sh",
  models: {
    grid: Grid,
    brick: Brick,
    page: Page,
    site: Site,
    user: User,
  },
});
