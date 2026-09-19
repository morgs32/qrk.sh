import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import {
  primitives,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from "@zerospin/schema";
import { Effect, Schema } from "effect";

import { makePlacementId } from "../../models/placement/makePlacementId";
import { visibleLayoutError } from "../../resolveVisibleCollisions";
import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { updateLayoutAtBreakpoint } from "./updateLayoutAtBreakpoint";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

export function makeUpdateLayoutAtBreakpointContract(props: {
  wall: typeof wallModelV1;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const updateLayoutAtBreakpointPayload = {
    wallId: primitives.foreignKey({ abbreviation: props.wall.abbreviation }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    layout: primitives.json({
      schema: Schema.Array(gridItemSchema),
    }),
  };

  return makeContractVersion(updateLayoutAtBreakpoint, {
    payload: updateLayoutAtBreakpointPayload,
    models: {
      wall: props.wall,
      brick: props.brick,
      placement: props.placement,
    },
    version: "1.0.0",
    guard: Effect.fn("updateLayoutAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof updateLayoutAtBreakpointPayload>;
    }) {
      const wall = db.query.wall
        .findFirst({
          where: { id: { eq: payload.wallId } },
        })
        .sync();

      if (wall === undefined) {
        return yield* new ZerospinError({
          code: "update-layout-wall-not-found",
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const bricks = db.query.brick
        .findMany({
          where: { wallId: { eq: payload.wallId } },
        })
        .sync();
      const brickIds = new Set(bricks.map(brickRow => brickRow.id));

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
      for (const item of payload.layout) {
        if (layoutIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "update-layout-duplicate-item",
            message: `layout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        layoutIds.add(item.i);

        if (!brickIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "update-layout-item-not-on-wall",
            message: `layout item ${item.i} is not a brick on wall ${payload.wallId}`,
            status: 400,
          });
        }

        if (!visibleBrickIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "update-layout-item-not-visible",
            message: `layout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (layoutIds.size !== visibleBrickIds.size) {
        return yield* new ZerospinError({
          code: "update-layout-set-mismatch",
          message: `layout must include exactly the visible placements at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const brickId of visibleBrickIds) {
        if (!layoutIds.has(brickId)) {
          return yield* new ZerospinError({
            code: "update-layout-set-mismatch",
            message: `layout is missing visible brick ${brickId}`,
            status: 400,
          });
        }
      }

      const layoutError = visibleLayoutError({
        layout: payload.layout,
        context: "updateLayoutAtBreakpoint",
      });
      if (layoutError !== null) {
        return yield* new ZerospinError({
          code: "update-layout-invalid",
          message: layoutError,
          status: 400,
        });
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        const mutations = [];
        for (const item of payload.layout) {
          mutations.push(
            yield* models.placement.update({
              resourceId: makePlacementId(
                item.i,
                payload.breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
              attributes: {
                gridItem: structuredClone(item),
              } as Partial<
                InferDecodedRow<(typeof props.placement)["attributes"]>
              >,
            }),
          );
        }
        return mutations;
      }),
  });
}
