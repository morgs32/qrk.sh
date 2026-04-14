import { makeBackend, makeSystem } from "zerospin";

import { createSite } from "@/zerospin/dashboard/contracts";
import { dashboardController } from "@/zerospin/dashboard/dashboardController";
import { Site } from "@/zerospin/dashboard/models";
import {
  createLayoutItem,
  createTextBrickContent,
  createUser,
  updateLayoutItem,
  updateTextBrickContent,
  updateUser,
} from "@/zerospin/website/contracts";
import { websiteController } from "@/zerospin/website/controller";
import { LayoutItem, TextBrickContent, User } from "@/zerospin/website/models";

export const backend = makeBackend({
  controller: websiteController,
  getGraph: (props) => {
    const { actorId, db } = props;
    return db.query.user
      .findFirst({
        where: { id: { eq: actorId } },
        with: {
          layoutItems: {
            with: {
              textBrickContent: true,
            },
          },
        },
      })
      .sync();
  },
});

export const dashboardBackend = makeBackend({
  controller: dashboardController,
  getGraph: (props) => {
    const { actorId, db } = props;
    return db.query.user
      .findFirst({
        where: { id: { eq: actorId } },
      })
      .sync();
  },
});

export const system = makeSystem({
  controllers: {
    website: websiteController,
    dashboard: dashboardController,
  },
  backends: {
    website: backend,
    dashboard: dashboardBackend,
  },
  contracts: {
    createLayoutItem,
    createTextBrickContent,
    createUser,
    updateLayoutItem,
    updateTextBrickContent,
    updateUser,
    createSite,
  },
  models: {
    layoutItem: LayoutItem,
    textBrickContent: TextBrickContent,
    user: User,
    site: Site,
  },
  actor: "user",
  id: "qrkSys_v1_7KpQmN2xRt4YwZ8",
  version: "1.0.0",
});
