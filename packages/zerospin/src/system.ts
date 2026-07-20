import { makeAccountController } from "@zerospin/core/accountController/makeAccountController";
import { makeSystem } from "@zerospin/core/system/makeSystem";

import { createGrid, createPage, createSite, createUser, updateGrid } from "./contracts";
import { Grid } from "./models/Grid";
import { Brick } from "./models/Brick";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { userActor } from "./accounts/user/actors/user/userActor";

export const userAccount = makeAccountController({
  name: "user",
  version: "1.1.0",
  actorControllers: {
    user: userActor,
  },
  models: {
    grid: Grid,
    brick: Brick,
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
  version: "3.0.0",
});
