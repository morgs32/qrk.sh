import { ContractError } from "@zerospin/error";
import { findMany } from "@zerospin/core/contracts/findMany";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { primitives, type IInferDecodedRow, type IInferIdFromAbbreviation } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import { makePlacementId } from "../../models/placement/makePlacementId";
import { makeCompactLayout, findVisibleLayoutError } from "../../resolveVisibleCollisions";
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
  const { wall, brick, placement } = props;
  const updateLayoutAtBreakpointPayload = {
    wallId: primitives.foreignKey({ abbreviation: wall.abbreviation }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    layout: primitives.json({
      schema: Schema.Array(gridItemSchema),
    }),
  };

  return makeAggregateContractVersion(updateLayoutAtBreakpoint, {
    operations: { updatePlacement: placement.operations.update },
    failures: {
      updateLayoutWallNotFound: ContractError.schema({ code: "update-layout-wall-not-found" }),
      updateLayoutDuplicateItem: ContractError.schema({ code: "update-layout-duplicate-item" }),
      updateLayoutItemNotOnWall: ContractError.schema({ code: "update-layout-item-not-on-wall" }),
      updateLayoutItemNotVisible: ContractError.schema({ code: "update-layout-item-not-visible" }),
      updateLayoutSetMismatch: ContractError.schema({ code: "update-layout-set-mismatch" }),
      updateLayoutInvalid: ContractError.schema({ code: "update-layout-invalid" }),
    },

    payload: updateLayoutAtBreakpointPayload,
    models: {
      wall,
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("updateLayoutAtBreakpoint.guard")(function* (props) {
      const { failures, db, payload } = props;

      const wallRow = yield* findFirst({
        db: db,
        model: wall,
        where: { id: { eq: payload.wallId } },
      });

      if (wallRow === undefined) {
        return yield* failures.updateLayoutWallNotFound.make({
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const bricks = yield* findMany({
        db: db,
        model: brick,
        where: { wallId: { eq: payload.wallId } },
      });
      const brickIds = new Set<string>(bricks.map((brickRow) => brickRow.id));

      const visibleBrickIds = new Set<string>();
      for (const brickRow of bricks) {
        const placementRow = yield* findFirst({
          db: db,
          model: placement,
          where: {
            id: { eq: makePlacementId(brickRow.id, payload.breakpoint) },
          },
        });
        if (placementRow !== undefined && placementRow.isVisible) {
          visibleBrickIds.add(brickRow.id);
        }
      }

      const layoutIds = new Set<string>();
      for (const item of payload.layout) {
        if (layoutIds.has(item.i)) {
          return yield* failures.updateLayoutDuplicateItem.make({
            message: `layout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        layoutIds.add(item.i);

        if (!brickIds.has(item.i)) {
          return yield* failures.updateLayoutItemNotOnWall.make({
            message: `layout item ${item.i} is not a brick on wall ${payload.wallId}`,
            status: 400,
          });
        }

        if (!visibleBrickIds.has(item.i)) {
          return yield* failures.updateLayoutItemNotVisible.make({
            message: `layout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (layoutIds.size !== visibleBrickIds.size) {
        return yield* failures.updateLayoutSetMismatch.make({
          message: `layout must include exactly the visible placements at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const brickId of visibleBrickIds) {
        if (!layoutIds.has(brickId)) {
          return yield* failures.updateLayoutSetMismatch.make({
            message: `layout is missing visible brick ${brickId}`,
            status: 400,
          });
        }
      }

      const layoutError = findVisibleLayoutError({
        layout: payload.layout,
        context: "updateLayoutAtBreakpoint",
      });
      if (layoutError !== null) {
        return yield* failures.updateLayoutInvalid.make({
          message: layoutError,
          status: 400,
        });
      }
    }),
    program: (props) => {
      const { operations, payload, db } = props;
      return Effect.gen(function* () {
        const compacted = makeCompactLayout(payload.layout);
        for (const item of compacted) {
          const stored = (yield* findFirst({
            db: db,
            model: placement,
            where: { id: { eq: makePlacementId(item.i, payload.breakpoint) } },
          }))?.gridItem;
          if (
            stored?.i === item.i &&
            stored.x === item.x &&
            stored.y === item.y &&
            stored.w === item.w &&
            stored.h === item.h
          ) {
            continue;
          }

          yield* operations.updatePlacement({
            resourceId: makePlacementId(
              item.i,
              payload.breakpoint,
            ) as IInferIdFromAbbreviation<"plc">,
            attributes: {
              gridItem: structuredClone(item),
            } as Partial<IInferDecodedRow<(typeof placement)["attributes"]>>,
          });
        }
      });
    },
  });
}
