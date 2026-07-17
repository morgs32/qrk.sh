import { makeContract } from "@zerospin/core/contracts/makeContract";
import { makeModelIdSchema } from "@zerospin/core/models/makeIdSchema";
import { primitives } from "@zerospin/core/models/primitives";
import { prefixActorId } from "@zerospin/core/utils/prefixActorId";
import { Effect, Schema } from "effect";

import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";

export const createUser = makeContract({
  commandName: "createUser",
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    clerkUserId: primitives.text(),
    username: primitives.text({
      nullable: true,
    }),
    displayName: primitives.text({
      nullable: true,
    }),
  },
  mutations: Schema.Struct({
    created: User.createMutation("1.0.0"),
  }),
  program: ({ payload }) => {
    const { id, clerkUserId, username, displayName } = payload;
    return Effect.all({
      created: User.create("1.0.0", {
        resourceId: id,
        attributes: {
          actorId: prefixActorId(clerkUserId),
          clerkUserId,
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
    id: Site.primaryKey({ autogenerate: false }),
    userId: User.primaryKey({ autogenerate: false }),
    slug: primitives.text(),
    name: primitives.text(),
    description: primitives.text({
      nullable: true,
    }),
  },
  mutations: Schema.Struct({
    created: Site.createMutation("1.0.0"),
  }),
  program: ({ payload }) => {
    const { id, userId, slug, name, description } = payload;
    return Effect.all({
      created: Site.create("1.0.0", {
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
    id: Page.primaryKey({ autogenerate: false }),
    siteId: Site.primaryKey({ autogenerate: false }),
    slug: primitives.text(),
    title: primitives.text(),
    description: primitives.text({
      nullable: true,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"],
    }),
  },
  mutations: Schema.Struct({
    created: Page.createMutation("1.0.0"),
  }),
  program: ({ payload }) => {
    const { id, siteId, slug, title, description, pageType } = payload;
    return Effect.all({
      created: Page.create("1.0.0", {
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
    id: Grid.primaryKey({ autogenerate: false }),
    pageId: Page.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    columnCount: primitives.integer(),
    gridItems: primitives.json({
      schema: Schema.Array(
        Schema.Struct({
          id: makeModelIdSchema(GridItem),
          itemKey: Schema.String,
          x: Schema.Int,
          y: Schema.Int,
          w: Schema.Int,
          h: Schema.Int,
          collectionName: Schema.String,
          brickName: Schema.String,
        }),
      ),
    }),
  },
  mutations: Schema.Array(
    Schema.Union(
      Grid.createMutation("2.0.0"),
      GridItem.createMutation("1.0.0"),
    ),
  ),
  program: ({ payload }) =>
    Effect.gen(function* () {
      const { id, pageId, name, columnCount, gridItems } = payload;
      const mutations = [];

      // 1 — create the Grid before any GridItem references it.
      mutations.push(
        yield* Grid.create("2.0.0", {
          resourceId: id,
          attributes: {
            pageId,
            name,
            columnCount,
            revision: 0,
          },
        }),
      );

      // 2 — preserve submitted order and emit one create mutation per GridItem.
      for (const gridItem of gridItems) {
        mutations.push(
          yield* GridItem.create("1.0.0", {
            resourceId: gridItem.id,
            attributes: {
              gridId: id,
              itemKey: gridItem.itemKey,
              x: gridItem.x,
              y: gridItem.y,
              w: gridItem.w,
              h: gridItem.h,
              collectionName: gridItem.collectionName,
              brickName: gridItem.brickName,
            },
          }),
        );
      }

      return mutations;
    }),
  version: "1.0.0",
});

export const updateGrid = makeContract({
  commandName: "updateGrid",
  payload: {
    id: Grid.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    columnCount: primitives.integer(),
    gridIntent: primitives.enum({
      values: ["update", "none"],
    }),
    expectedRevision: primitives.integer(),
    gridItems: primitives.json({
      schema: Schema.Array(
        Schema.Struct({
          intent: Schema.Literal("create", "update", "none"),
          id: makeModelIdSchema(GridItem),
          itemKey: Schema.String,
          x: Schema.Int,
          y: Schema.Int,
          w: Schema.Int,
          h: Schema.Int,
          collectionName: Schema.String,
          brickName: Schema.String,
        }),
      ),
    }),
    deletedGridItemIds: primitives.json({
      schema: Schema.Array(makeModelIdSchema(GridItem)),
    }),
  },
  mutations: Schema.Array(
    Schema.Union(
      Grid.updateMutation("2.0.0"),
      GridItem.createMutation("1.0.0"),
      GridItem.updateMutation("1.0.0"),
      GridItem.deleteMutation("1.0.0"),
    ),
  ),
  program: ({ payload }) =>
    Effect.gen(function* () {
      const mutations = [];

      // 1 — every real aggregate change advances Grid.revision. This makes a
      // GridItem-only Save visible to the next editor snapshot without writing
      // a Grid mutation when the complete aggregate is unchanged.
      if (
        payload.gridIntent === "update" ||
        payload.gridItems.some((gridItem) => gridItem.intent !== "none") ||
        payload.deletedGridItemIds.length > 0
      ) {
        mutations.push(
          yield* Grid.update("2.0.0", {
            resourceId: payload.id,
            attributes: {
              name: payload.name,
              columnCount: payload.columnCount,
              revision: payload.expectedRevision + 1,
            },
          }),
        );
      }

      // 2 — emit exactly the create and update mutations approved by the frontend guard.
      for (const gridItem of payload.gridItems) {
        if (gridItem.intent === "none") {
          continue;
        }

        if (gridItem.intent === "create") {
          mutations.push(
            yield* GridItem.create("1.0.0", {
              resourceId: gridItem.id,
              attributes: {
                gridId: payload.id,
                itemKey: gridItem.itemKey,
                x: gridItem.x,
                y: gridItem.y,
                w: gridItem.w,
                h: gridItem.h,
                collectionName: gridItem.collectionName,
                brickName: gridItem.brickName,
              },
            }),
          );
          continue;
        }

        mutations.push(
          yield* GridItem.update("1.0.0", {
            resourceId: gridItem.id,
            attributes: {
              x: gridItem.x,
              y: gridItem.y,
              w: gridItem.w,
              h: gridItem.h,
              collectionName: gridItem.collectionName,
              brickName: gridItem.brickName,
            },
          }),
        );
      }

      // 3 — omitted persisted items arrive explicitly as deletes in the same command.
      for (const deletedGridItemId of payload.deletedGridItemIds) {
        mutations.push(
          yield* GridItem.delete("1.0.0", {
            resourceId: deletedGridItemId,
          }),
        );
      }

      return mutations;
    }),
  version: "1.0.0",
});
