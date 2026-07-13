import { makeAccountController } from "@zerospin/core/accountController/makeAccountController";
import { makeSystem } from "@zerospin/core/system/makeSystem";

import { createGrid, createPage, createSite, createUser, updateGrid } from "./contracts";
import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { owner } from "./owner";

export const userAccount = makeAccountController({
  name: "user",
  actorControllers: {
    owner,
  },
  models: {
    grid: Grid,
    gridItem: GridItem,
    page: Page,
    site: Site,
    user: User,
  },
  contracts: {
    createGrid,
    createPage,
    createSite,
    createUser,
    updateGrid,
  },
});

export const system = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  name: "qrk-sh",
  version: "2.0.0",
});
