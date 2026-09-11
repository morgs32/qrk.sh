import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeModelIdSchema } from "@zerospin/core/models/makeIdSchema";
import { contracts, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { gridV1 as Grid } from "../../models/grid/GridV1";
import { brickV1 as Brick } from "../../models/brick/BrickV1";
import { pageV1 as Page } from "../../models/page/PageV1";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { updateGrid } from "./updateGrid";

const updateGridPayload = {
  id: primitives.foreignKey({ abbreviation: Grid.abbreviation }),
  name: primitives.text(),
  columnCount: primitives.integer(),
  gridIntent: primitives.enum({
    values: ["update", "none"],
  }),
  expectedRevision: primitives.integer(),
  bricks: primitives.json({
    schema: Schema.Array(
      Schema.Struct({
        intent: Schema.Literals(["create", "update", "none"]),
        id: makeModelIdSchema(Brick),
        brickKey: Schema.String,
        x: Schema.Int,
        y: Schema.Int,
        w: Schema.Int,
        h: Schema.Int,
        collectionName: Schema.String,
        variant: Schema.String,
        size: Schema.String,
      }),
    ),
  }),
  deletedBrickIds: primitives.json({
    schema: Schema.Array(makeModelIdSchema(Brick)),
  }),
};

export const updateGridV1 = contracts.makeVersion(updateGrid, {
  payload: updateGridPayload,
  models: { brick: Brick, grid: Grid, page: Page, site: Site, user: User },
  guard: Effect.fn("updateGrid.guard")(function* ({
    userId,
    db,
    payload,
  }: {
    userId: string | null;
    db: Readonly<
      Pick<
        IDb<
          IResourceDbConfig<
            {
              brick: typeof Brick;
              grid: typeof Grid;
              page: typeof Page;
              site: typeof Site;
              user: typeof User;
            },
            Record<never, never>
          >
        >,
        "query"
      >
    >;
    payload: InferCommandPayload<typeof updateGridPayload>;
  }) {
    const grid = db.query.grid
      .findFirst({
        where: { id: { eq: payload.id } },
      })
      .sync();

    if (grid === undefined) {
      return yield* new ZerospinError({
        code: "update-grid-not-found",
        message: `Grid ${payload.id} was not found`,
        status: 404,
      });
    }

    const page =
      grid.pageId === null
        ? undefined
        : db.query.page
            .findFirst({
              where: { id: { eq: grid.pageId } },
            })
            .sync();
    const site =
      page === undefined || page.siteId === null
        ? undefined
        : db.query.site
            .findFirst({
              where: { id: { eq: page.siteId } },
            })
            .sync();
    const user =
      site === undefined || site.userId === null
        ? undefined
        : db.query.user
            .findFirst({
              where: { id: { eq: site.userId } },
            })
            .sync();

    if (
      page === undefined ||
      site === undefined ||
      user === undefined ||
      user.actorId !== `actr_${userId}`
    ) {
      return yield* new ZerospinError({
        code: "update-grid-user-mismatch",
        message: `Grid ${payload.id} does not belong to user ${userId}`,
        status: 403,
      });
    }

    const canonicalGridId = Grid.prefixId(`${grid.pageId}/main`);
    if (payload.id !== canonicalGridId) {
      return yield* new ZerospinError({
        code: "update-grid-id-not-canonical",
        message: `Grid ${payload.id} must use canonical page Grid id ${canonicalGridId}`,
        status: 400,
      });
    }

    if (grid.revision !== payload.expectedRevision) {
      return yield* new ZerospinError({
        code: "update-grid-stale",
        message: `Grid ${payload.id} advanced from revision ${payload.expectedRevision} to ${grid.revision}`,
        status: 409,
      });
    }

    const gridAttributesChanged =
      grid.name !== payload.name || grid.columnCount !== payload.columnCount;
    if (payload.gridIntent === "update" && !gridAttributesChanged) {
      return yield* new ZerospinError({
        code: "update-grid-intent-without-change",
        message: `Grid ${payload.id} declared update intent without changed attributes`,
        status: 400,
      });
    }
    if (payload.gridIntent === "none" && gridAttributesChanged) {
      return yield* new ZerospinError({
        code: "update-grid-change-without-intent",
        message: `Grid ${payload.id} changed without update intent`,
        status: 400,
      });
    }

    const persistedBricks = db.query.brick
      .findMany({
        where: { gridId: { eq: payload.id } },
      })
      .sync();
    let hasMutationIntent = payload.gridIntent === "update";

    // 1 — desired snapshot ids and brick keys must each be unique.
    for (let brickIndex = 0; brickIndex < payload.bricks.length; brickIndex += 1) {
      const brick = payload.bricks[brickIndex];
      if (brick === undefined) {
        continue;
      }

      const canonicalBrickId = Brick.prefixId(`${payload.id}/${brick.brickKey}`);
      if (brick.id !== canonicalBrickId) {
        return yield* new ZerospinError({
          code: "update-brick-id-not-canonical",
          message: `Brick ${brick.id} must use canonical Brick id ${canonicalBrickId}`,
          status: 400,
        });
      }

      for (
        let comparedBrickIndex = brickIndex + 1;
        comparedBrickIndex < payload.bricks.length;
        comparedBrickIndex += 1
      ) {
        const comparedBrick = payload.bricks[comparedBrickIndex];
        if (comparedBrick === undefined) {
          continue;
        }
        if (brick.id === comparedBrick.id) {
          return yield* new ZerospinError({
            code: "update-grid-duplicate-brick-id",
            message: `Brick id ${brick.id} appears more than once`,
            status: 400,
          });
        }
        if (brick.brickKey === comparedBrick.brickKey) {
          return yield* new ZerospinError({
            code: "update-grid-duplicate-brick-key",
            message: `Brick key ${brick.brickKey} appears more than once`,
            status: 400,
          });
        }
      }

      const persistedBrick = db.query.brick
        .findFirst({
          where: { id: { eq: brick.id } },
        })
        .sync();

      if (brick.intent === "create") {
        hasMutationIntent = true;
        if (persistedBrick !== undefined) {
          return yield* new ZerospinError({
            code: "update-grid-create-brick-already-exists",
            message: `Brick ${brick.id} cannot be created because it already exists`,
            status: 409,
          });
        }
        continue;
      }

      if (
        persistedBrick === undefined ||
        persistedBrick.gridId !== payload.id ||
        persistedBrick.brickKey !== brick.brickKey
      ) {
        return yield* new ZerospinError({
          code: "update-brick-identity-mismatch",
          message: `Brick ${brick.id} does not match Grid ${payload.id} and key ${brick.brickKey}`,
          status: 400,
        });
      }

      const brickChanged =
        persistedBrick.x !== brick.x ||
        persistedBrick.y !== brick.y ||
        persistedBrick.w !== brick.w ||
        persistedBrick.h !== brick.h ||
        persistedBrick.collectionName !== brick.collectionName ||
        persistedBrick.variant !== brick.variant ||
        persistedBrick.size !== brick.size;

      if (brick.intent === "update") {
        hasMutationIntent = true;
        if (!brickChanged) {
          return yield* new ZerospinError({
            code: "update-brick-intent-without-change",
            message: `Brick ${brick.id} declared update intent without changed attributes`,
            status: 400,
          });
        }
      } else if (brickChanged) {
        return yield* new ZerospinError({
          code: "update-brick-change-without-intent",
          message: `Brick ${brick.id} changed without update intent`,
          status: 400,
        });
      }
    }

    // 2 — delete ids must be unique, belong to this Grid, and not remain in the desired snapshot.
    for (
      let deletedBrickIndex = 0;
      deletedBrickIndex < payload.deletedBrickIds.length;
      deletedBrickIndex += 1
    ) {
      const deletedBrickId = payload.deletedBrickIds[deletedBrickIndex];
      if (deletedBrickId === undefined) {
        continue;
      }
      hasMutationIntent = true;

      for (
        let comparedDeletedBrickIndex = deletedBrickIndex + 1;
        comparedDeletedBrickIndex < payload.deletedBrickIds.length;
        comparedDeletedBrickIndex += 1
      ) {
        if (deletedBrickId === payload.deletedBrickIds[comparedDeletedBrickIndex]) {
          return yield* new ZerospinError({
            code: "update-grid-duplicate-delete-id",
            message: `Deleted Brick id ${deletedBrickId} appears more than once`,
            status: 400,
          });
        }
      }

      for (const desiredBrick of payload.bricks) {
        if (desiredBrick.id === deletedBrickId) {
          return yield* new ZerospinError({
            code: "update-brick-kept-and-deleted",
            message: `Brick ${deletedBrickId} cannot be kept and deleted in one snapshot`,
            status: 400,
          });
        }
      }

      const deletedBrick = db.query.brick
        .findFirst({
          where: { id: { eq: deletedBrickId } },
        })
        .sync();
      if (deletedBrick === undefined || deletedBrick.gridId !== payload.id) {
        return yield* new ZerospinError({
          code: "update-grid-delete-brick-identity-mismatch",
          message: `Deleted Brick ${deletedBrickId} does not belong to Grid ${payload.id}`,
          status: 400,
        });
      }
    }

    // 3 — every persisted brick must be represented exactly once as kept or deleted.
    for (const persistedBrick of persistedBricks) {
      let isInDesiredSnapshot = false;
      for (const desiredBrick of payload.bricks) {
        if (desiredBrick.id === persistedBrick.id) {
          isInDesiredSnapshot = true;
        }
      }

      let isDeleted = false;
      for (const deletedBrickId of payload.deletedBrickIds) {
        if (deletedBrickId === persistedBrick.id) {
          isDeleted = true;
        }
      }

      if (!isInDesiredSnapshot && !isDeleted) {
        return yield* new ZerospinError({
          code: "update-grid-incomplete-snapshot",
          message: `Persisted Brick ${persistedBrick.id} is missing from the submitted snapshot`,
          status: 400,
        });
      }
    }

    if (!hasMutationIntent) {
      return yield* new ZerospinError({
        code: "update-grid-no-changes",
        message: `Grid ${payload.id} has no changes to save`,
        status: 400,
      });
    }
  }),
  program: ({ payload, models }) =>
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
          yield* models.grid.update({
            resourceId: payload.id,
            attributes: {
              name: payload.name,
              columnCount: payload.columnCount,
              revision: payload.expectedRevision + 1,
            },
          }),
        );
      }

      // 2 — emit exactly the create and update mutations approved by the contract guard.
      for (const brick of payload.bricks) {
        if (brick.intent === "none") {
          continue;
        }

        if (brick.intent === "create") {
          mutations.push(
            yield* models.brick.create({
              resourceId: brick.id,
              attributes: {
                gridId: payload.id,
                brickKey: brick.brickKey,
                x: brick.x,
                y: brick.y,
                w: brick.w,
                h: brick.h,
                collectionName: brick.collectionName,
                variant: brick.variant,
                size: brick.size,
              },
            }),
          );
          continue;
        }

        mutations.push(
          yield* models.brick.update({
            resourceId: brick.id,
            attributes: {
              x: brick.x,
              y: brick.y,
              w: brick.w,
              h: brick.h,
              collectionName: brick.collectionName,
              variant: brick.variant,
              size: brick.size,
            },
          }),
        );
      }

      // 3 — omitted persisted bricks arrive explicitly as deletes in the same command.
      for (const deletedBrickId of payload.deletedBrickIds) {
        mutations.push(
          yield* models.brick.delete({
            resourceId: deletedBrickId,
          }),
        );
      }

      return mutations;
    }),
  version: "1.0.0",
});
