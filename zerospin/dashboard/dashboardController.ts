import { makeController } from "zerospin";

import { createSite } from "@/zerospin/dashboard/contracts";
import { Site } from "@/zerospin/dashboard/models";
import { User } from "@/zerospin/website/models";

export const dashboardModels = {
  site: Site,
  user: User,
};

export const dashboardController = makeController({
  contracts: {
    createSite,
  },
  name: "dashboard",
  systemName: "qrk-sh",
  models: dashboardModels,
  linked: "user",
  actor: "user",
});
