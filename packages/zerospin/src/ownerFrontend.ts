import { makeFrontendController } from "@zerospin/core/frontendController/makeFrontendController";
import { makeModelIdSchema } from "@zerospin/core/models/makeIdSchema";
import { Schema } from "effect";

import {
  createGrid,
  createGridItem,
  createPage,
  createSite,
  createUser,
  updateGridItem,
} from "./contracts";
import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";

export const ownerFrontend = makeFrontendController({
  contracts: {
    createGrid,
    createGridItem,
    createPage,
    createSite,
    createUser,
    updateGridItem,
  },
  accountName: "user",
  actorName: "owner",
  surfaceName: "web",
  version: "1.0.0",
  systemName: "qrk-sh",
  models: {
    grid: Grid,
    gridItem: GridItem,
    page: Page,
    site: Site,
    user: User,
  },
  signature: Schema.Struct({
    userId: makeModelIdSchema(User),
  }),
});
