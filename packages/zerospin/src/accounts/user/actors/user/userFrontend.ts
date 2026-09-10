import { makeFrontendController } from "@zerospin/sdk/browser";

import { createGrid, createPage, createSite, createUser, updateGrid } from "../../../../contracts";
import { Grid } from "../../../../models/Grid";
import { Brick } from "../../../../models/Brick";
import { Page } from "../../../../models/Page";
import { Site } from "../../../../models/Site";
import { User } from "../../../../models/User";

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
