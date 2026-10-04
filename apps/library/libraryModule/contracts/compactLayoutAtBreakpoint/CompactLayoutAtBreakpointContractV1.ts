import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import { primitives, type InferDecodedRow, type InferIdFromAbbreviation } from "@zerospin/schema";
import { Effect, Schema } from "effect";

import { makePlacementId } from "../../models/placement/makePlacementId";
import { makeCompactLayout, findVisibleLayoutError } from "../../resolveVisibleCollisions";
import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { compactLayoutAtBreakpoint } from "./compactLayoutAtBreakpoint";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

export function makeCompactLayoutAtBreakpointContract(props: {
  wall: typeof wallModelV1;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { wall, brick, placement } = props;
  const compactLayoutAtBreakpointPayload = {
    wallId: primitives.foreignKey({ abbreviation: wall.abbreviation }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    visibleLayout: primitives.json({
      schema: Schema.Array(gridItemSchema),
    }),
  };

  return makeContractVersion(compactLayoutAtBreakpoint, {
    payload: compactLayoutAtBreakpointPayload,
    models: {
      wall,
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("compactLayoutAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      claims: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof compactLayoutAtBreakpointPayload>;
    }) {
      const wall = db.query.wall
        .findFirst({
          where: { id: { eq: payload.wallId } },
        })
        .sync();

      if (wall === undefined) {
        return yield* new ZerospinError({
          code: "compact-layout-wall-not-found",
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const bricks = db.query.brick
        .findMany({
          where: { wallId: { eq: payload.wallId } },
        })
        .sync();
      const brickIds = new Set(bricks.map((brickRow) => brickRow.id));

      const visibleBrickIds = new Set<string>();
      for (const brickRow of bricks) {
        const placement = db.query.placement
          .findFirst({
            where: {
              id: { eq: makePlacementId(brickRow.id, payload.breakpoint) },
            },
          })
          .sync();
        if (placement !== undefined && placement.isVisible) {
          visibleBrickIds.add(brickRow.id);
        }
      }

      const layoutIds = new Set<string>();
      for (const item of payload.visibleLayout) {
        if (layoutIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "compact-layout-duplicate-item",
            message: `visible layout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        layoutIds.add(item.i);

        if (!brickIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "compact-layout-item-not-on-wall",
            message: `visible layout item ${item.i} is not a brick on wall ${payload.wallId}`,
            status: 400,
          });
        }

        if (!visibleBrickIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "compact-layout-item-not-visible",
            message: `visible layout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (layoutIds.size !== visibleBrickIds.size) {
        return yield* new ZerospinError({
          code: "compact-layout-set-mismatch",
          message: `visibleLayout must include exactly the visible placements at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const brickId of visibleBrickIds) {
        if (!layoutIds.has(brickId)) {
          return yield* new ZerospinError({
            code: "compact-layout-set-mismatch",
            message: `visibleLayout is missing visible brick ${brickId}`,
            status: 400,
          });
        }
      }

      const layoutError = findVisibleLayoutError({
        layout: payload.visibleLayout,
        context: "compactLayoutAtBreakpoint",
      });
      if (layoutError !== null) {
        return yield* new ZerospinError({
          code: "compact-layout-invalid",
          message: layoutError,
          status: 400,
        });
      }
    }),
    program: (props) => {
      const { payload, models, db } = props;
      return Effect.gen(function* () {
        const compacted = makeCompactLayout(payload.visibleLayout);
        for (const item of compacted) {
          const stored = db.query.placement
            .findFirst({
              where: { id: { eq: makePlacementId(item.i, payload.breakpoint) } },
            })
            .sync()?.gridItem;
          if (
            stored?.i === item.i &&
            stored.x === item.x &&
            stored.y === item.y &&
            stored.w === item.w &&
            stored.h === item.h
          ) {
            continue;
          }

          yield* models.placement.update({
            resourceId: makePlacementId(
              item.i,
              payload.breakpoint,
            ) as InferIdFromAbbreviation<"plc">,
            attributes: {
              gridItem: item,
            } as Partial<InferDecodedRow<(typeof placement)["attributes"]>>,
          });
        }
      });
    },
  });
}
