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

import { createGrid } from "./createGrid";

const createGridPayload = {
  id: primitives.foreignKey({ abbreviation: Grid.abbreviation }),
  pageId: primitives.foreignKey({ abbreviation: Page.abbreviation }),
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
        variant: Schema.String,
        size: Schema.String,
      }),
    ),
  }),
};

export const createGridV1 = contracts.makeVersion(createGrid, {
  payload: createGridPayload,
  models: { brick: Brick, grid: Grid, page: Page, site: Site, user: User },
  guard: Effect.fn("createGrid.guard")(function* ({
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
    payload: InferCommandPayload<typeof createGridPayload>;
  }) {
    const page = db.query.page
      .findFirst({
        where: { id: { eq: payload.pageId } },
      })
      .sync();

    if (page === undefined) {
      return yield* new ZerospinError({
        code: "create-grid-page-not-found",
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }

    const site =
      page.siteId === null
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

    if (site === undefined || user === undefined || user.actorId !== `actr_${userId}`) {
      return yield* new ZerospinError({
        code: "create-grid-user-mismatch",
        message: `Page ${payload.pageId} does not belong to user ${userId}`,
        status: 403,
      });
    }

    const canonicalGridId = Grid.prefixId(`${payload.pageId}/main`);
    if (payload.id !== canonicalGridId) {
      return yield* new ZerospinError({
        code: "create-grid-id-not-canonical",
        message: `Grid ${payload.id} must use canonical page Grid id ${canonicalGridId}`,
        status: 400,
      });
    }

    const existingGrid = db.query.grid
      .findFirst({
        where: { pageId: { eq: payload.pageId } },
      })
      .sync();

    if (existingGrid !== undefined) {
      return yield* new ZerospinError({
        code: "create-grid-page-already-has-grid",
        message: `Page ${payload.pageId} already has Grid ${existingGrid.id}`,
        status: 409,
      });
    }

    // 1 — a create snapshot cannot repeat a resource id or stable item key.
    for (let brickIndex = 0; brickIndex < payload.bricks.length; brickIndex += 1) {
      const brick = payload.bricks[brickIndex];
      if (brick === undefined) {
        continue;
      }

      const canonicalBrickId = Brick.prefixId(`${payload.id}/${brick.brickKey}`);
      if (brick.id !== canonicalBrickId) {
        return yield* new ZerospinError({
          code: "create-brick-id-not-canonical",
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
            code: "create-grid-duplicate-brick-id",
            message: `Brick id ${brick.id} appears more than once`,
            status: 400,
          });
        }
        if (brick.brickKey === comparedBrick.brickKey) {
          return yield* new ZerospinError({
            code: "create-grid-duplicate-brick-key",
            message: `Brick key ${brick.brickKey} appears more than once`,
            status: 400,
          });
        }
      }

      const existingBrick = db.query.brick
        .findFirst({
          where: { id: { eq: brick.id } },
        })
        .sync();
      if (existingBrick !== undefined) {
        return yield* new ZerospinError({
          code: "create-brick-already-exists",
          message: `Brick ${brick.id} already exists`,
          status: 409,
        });
      }
    }
  }),
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const { id, pageId, name, columnCount, bricks } = payload;
      const mutations = [];

      // 1 — create the Grid before any Brick references it.
      mutations.push(
        yield* models.grid.create({
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
          yield* models.brick.create({
            resourceId: brick.id,
            attributes: {
              gridId: id,
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
      }

      return mutations;
    }),
  version: "1.0.0",
});
