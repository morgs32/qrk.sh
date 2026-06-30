import { createMutation } from "@zerospin/core/contracts/createMutation";
import { makeContract } from "@zerospin/core/contracts/makeContract";
import { updateMutation } from "@zerospin/core/contracts/updateMutation";
import { primitives } from "@zerospin/core/models/primitives";
import { makeActorId } from "@zerospin/core/utils/makeActorId";
import { Effect } from "effect";

import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";

export const createUser = makeContract({
  commandName: "createUser",
  payload: {
    id: primitives.id({ model: User }),
    clerkUserId: primitives.text(),
    username: primitives.text(),
    displayName: primitives.text({
      nullable: true,
    }),
  },
  program: ({ payload }) => {
    const { id, clerkUserId, username, displayName } = payload;
    return Effect.all({
      created: createMutation({
        model: User,
        resourceId: id,
        attributes: {
          actorId: makeActorId({ id: clerkUserId }),
          username,
          displayName,
        },
      }),
    });
  },
  version: "1.0.0",
});

export const createSite = makeContract({
  commandName: "createSite",
  payload: {
    id: primitives.id({ model: Site }),
    userId: primitives.id({ model: User }),
    slug: primitives.text(),
    name: primitives.text(),
    description: primitives.text({
      nullable: true,
    }),
  },
  program: ({ payload }) => {
    const { id, userId, slug, name, description } = payload;
    return Effect.all({
      created: createMutation({
        model: Site,
        resourceId: id,
        attributes: {
          userId,
          slug,
          name,
          description,
        },
      }),
    });
  },
  version: "1.0.0",
});

export const createPage = makeContract({
  commandName: "createPage",
  payload: {
    id: primitives.id({ model: Page }),
    siteId: primitives.id({ model: Site }),
    slug: primitives.text(),
    title: primitives.text(),
    description: primitives.text({
      nullable: true,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"] as const,
    }),
  },
  program: ({ payload }) => {
    const { id, siteId, slug, title, description, pageType } = payload;
    return Effect.all({
      created: createMutation({
        model: Page,
        resourceId: id,
        attributes: {
          siteId,
          slug,
          title,
          description,
          pageType,
        },
      }),
    });
  },
  version: "1.0.0",
});

export const createGrid = makeContract({
  commandName: "createGrid",
  payload: {
    id: primitives.id({ model: Grid }),
    pageId: primitives.id({ model: Page }),
    name: primitives.text(),
    columnCount: primitives.integer(),
  },
  program: ({ payload }) => {
    const { id, pageId, name, columnCount } = payload;
    return Effect.all({
      created: createMutation({
        model: Grid,
        resourceId: id,
        attributes: {
          pageId,
          name,
          columnCount,
        },
      }),
    });
  },
  version: "1.0.0",
});

export const createGridItem = makeContract({
  commandName: "createGridItem",
  payload: {
    id: primitives.id({ model: GridItem }),
    gridId: primitives.id({ model: Grid }),
    itemKey: primitives.text(),
    x: primitives.integer(),
    y: primitives.integer(),
    w: primitives.integer(),
    h: primitives.integer(),
    collectionName: primitives.text(),
    brickName: primitives.text(),
  },
  program: ({ payload }) => {
    const { id, gridId, itemKey, x, y, w, h, collectionName, brickName } = payload;
    return Effect.all({
      created: createMutation({
        model: GridItem,
        resourceId: id,
        attributes: {
          gridId,
          itemKey,
          x,
          y,
          w,
          h,
          collectionName,
          brickName,
        },
      }),
    });
  },
  version: "1.0.0",
});

export const updateGridItem = makeContract({
  commandName: "updateGridItem",
  payload: {
    id: primitives.id({ model: GridItem }),
    x: primitives.integer(),
    y: primitives.integer(),
    w: primitives.integer(),
    h: primitives.integer(),
    collectionName: primitives.text(),
    brickName: primitives.text(),
  },
  program: ({ payload }) => {
    const { id, x, y, w, h, collectionName, brickName } = payload;
    return Effect.all({
      updated: updateMutation({
        model: GridItem,
        resourceId: id,
        attributes: {
          x,
          y,
          w,
          h,
          collectionName,
          brickName,
        },
      }),
    });
  },
  version: "1.0.0",
});
