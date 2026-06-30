import { makeAccountController } from "@zerospin/core/accountController/makeAccountController";
import { makeSystem } from "@zerospin/core/system/makeSystem";

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
import { owner } from "./owner";

export const userAccount = makeAccountController({
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
    createGridItem,
    createPage,
    createSite,
    createUser,
    updateGridItem,
  },
});

export const system = makeSystem({
  id: "sys_qrk_sh_1",
  accountControllers: {
    user: userAccount,
  },
  name: "qrk-sh",
  version: "1.0.0",
});
