import { makeContract } from "@zerospin/core/contracts/makeContract";
import { makeModelIdSchema } from "@zerospin/core/models/makeIdSchema";
import { primitives } from "@zerospin/core/models/primitives";
import { prefixActorId } from "@zerospin/core/utils/prefixActorId";
import { Effect, Schema } from "effect";

import { Grid } from "./models/Grid";
import { Brick } from "./models/Brick";
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
    id: Site.primaryKey({ autogenerate: true }),
    userId: User.primaryKey({ autogenerate: false }),
    slug: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    name: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
  },
  mutations: Schema.Struct({
    created: Site.createMutation("2.0.0"),
  }),
  program: ({ payload }) => {
    const { id, userId, slug, name, description } = payload;
    return Effect.all({
      created: Site.create("2.0.0", {
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
  version: "1.1.0",
});

export const createPage = makeContract({
  commandName: "createPage",
  payload: {
    id: Page.primaryKey({ autogenerate: true }),
    siteId: Site.primaryKey({ autogenerate: false }),
    slug: primitives.text(),
    title: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"],
    }),
  },
  mutations: Schema.Struct({
    created: Page.createMutation("2.0.0"),
  }),
  program: ({ payload }) => {
    const { id, siteId, slug, title, description, pageType } = payload;
    return Effect.all({
      created: Page.create("2.0.0", {
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
  version: "1.1.0",
});

export const createGrid = makeContract({
  commandName: "createGrid",
  payload: {
    id: Grid.primaryKey({ autogenerate: false }),
    pageId: Page.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    columnCount: primitives.integer(),
    bricks: primitives.json({
      schema: Schema.Array(
        Schema.Struct({
          id: makeModelIdSchema(Brick),
          brickKey: Schema.String,
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
      Brick.createMutation("1.0.0"),
    ),
  ),
  program: ({ payload }) =>
    Effect.gen(function* () {
      const { id, pageId, name, columnCount, bricks } = payload;
      const mutations = [];

      // 1 — create the Grid before any Brick references it.
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

      // 2 — preserve submitted order and emit one create mutation per Brick.
      for (const brick of bricks) {
        mutations.push(
          yield* Brick.create("1.0.0", {
            resourceId: brick.id,
            attributes: {
              gridId: id,
              brickKey: brick.brickKey,
              x: brick.x,
              y: brick.y,
              w: brick.w,
              h: brick.h,
              collectionName: brick.collectionName,
              brickName: brick.brickName,
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
    bricks: primitives.json({
      schema: Schema.Array(
        Schema.Struct({
          intent: Schema.Literal("create", "update", "none"),
          id: makeModelIdSchema(Brick),
          brickKey: Schema.String,
          x: Schema.Int,
          y: Schema.Int,
          w: Schema.Int,
          h: Schema.Int,
          collectionName: Schema.String,
          brickName: Schema.String,
        }),
      ),
    }),
    deletedBrickIds: primitives.json({
      schema: Schema.Array(makeModelIdSchema(Brick)),
    }),
  },
  mutations: Schema.Array(
    Schema.Union(
      Grid.updateMutation("2.0.0"),
      Brick.createMutation("1.0.0"),
      Brick.updateMutation("1.0.0"),
      Brick.deleteMutation("1.0.0"),
    ),
  ),
  program: ({ payload }) =>
    Effect.gen(function* () {
      const mutations = [];

      // 1 — every real aggregate change advances Grid.revision. This makes a
      // Brick-only Save visible to the next editor snapshot without writing
      // a Grid mutation when the complete aggregate is unchanged.
      if (
        payload.gridIntent === "update" ||
        payload.bricks.some((brick) => brick.intent !== "none") ||
        payload.deletedBrickIds.length > 0
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
      for (const brick of payload.bricks) {
        if (brick.intent === "none") {
          continue;
        }

        if (brick.intent === "create") {
          mutations.push(
            yield* Brick.create("1.0.0", {
              resourceId: brick.id,
              attributes: {
                gridId: payload.id,
                brickKey: brick.brickKey,
                x: brick.x,
                y: brick.y,
                w: brick.w,
                h: brick.h,
                collectionName: brick.collectionName,
                brickName: brick.brickName,
              },
            }),
          );
          continue;
        }

        mutations.push(
          yield* Brick.update("1.0.0", {
            resourceId: brick.id,
            attributes: {
              x: brick.x,
              y: brick.y,
              w: brick.w,
              h: brick.h,
              collectionName: brick.collectionName,
              brickName: brick.brickName,
            },
          }),
        );
      }

      // 3 — omitted persisted bricks arrive explicitly as deletes in the same command.
      for (const deletedBrickId of payload.deletedBrickIds) {
        mutations.push(
          yield* Brick.delete("1.0.0", {
            resourceId: deletedBrickId,
          }),
        );
      }

      return mutations;
    }),
  version: "1.0.0",
});
