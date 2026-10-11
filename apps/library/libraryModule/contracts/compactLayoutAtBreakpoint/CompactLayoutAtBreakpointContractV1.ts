import { ContractError } from "@zerospin/error";
import { findMany } from "@zerospin/core/contracts/findMany";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import type { IOperation } from "@zerospin/core/contracts/types";
import { makeUpdateOperation } from "@zerospin/core/contracts/make/makeUpdateOperation";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ZerospinError } from "@zerospin/error";
import { primitives, type InferDecodedRow, type InferIdFromAbbreviation } from "@zerospin/shapes";
import { Channel, Effect, Schema } from "effect";

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

  return makeAggregateContractVersion(compactLayoutAtBreakpoint, {
    failures: {
      compactLayoutWallNotFound: ContractError.schema({ code: "compact-layout-wall-not-found" }),
      compactLayoutDuplicateItem: ContractError.schema({ code: "compact-layout-duplicate-item" }),
      compactLayoutItemNotOnWall: ContractError.schema({ code: "compact-layout-item-not-on-wall" }),
      compactLayoutItemNotVisible: ContractError.schema({
        code: "compact-layout-item-not-visible",
      }),
      compactLayoutSetMismatch: ContractError.schema({ code: "compact-layout-set-mismatch" }),
      compactLayoutInvalid: ContractError.schema({ code: "compact-layout-invalid" }),
    },

    payload: compactLayoutAtBreakpointPayload,
    models: {
      wall,
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("compactLayoutAtBreakpoint.guard")(function* (props) {
      const { failures, db, payload } = props;

      const wallRow = yield* findFirst({
        db: db,
        model: wall,
        where: { id: { eq: payload.wallId } },
      });

      if (wallRow === undefined) {
        return yield* failures.compactLayoutWallNotFound.make({
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
      for (const item of payload.visibleLayout) {
        if (layoutIds.has(item.i)) {
          return yield* failures.compactLayoutDuplicateItem.make({
            message: `visible layout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        layoutIds.add(item.i);

        if (!brickIds.has(item.i)) {
          return yield* failures.compactLayoutItemNotOnWall.make({
            message: `visible layout item ${item.i} is not a brick on wall ${payload.wallId}`,
            status: 400,
          });
        }

        if (!visibleBrickIds.has(item.i)) {
          return yield* failures.compactLayoutItemNotVisible.make({
            message: `visible layout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (layoutIds.size !== visibleBrickIds.size) {
        return yield* failures.compactLayoutSetMismatch.make({
          message: `visibleLayout must include exactly the visible placements at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const brickId of visibleBrickIds) {
        if (!layoutIds.has(brickId)) {
          return yield* failures.compactLayoutSetMismatch.make({
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
        return yield* failures.compactLayoutInvalid.make({
          message: layoutError,
          status: 400,
        });
      }
    }),
    program: (props) => {
      const { payload, db } = props;
      return Channel.unwrap(
        Effect.gen(function* () {
          const operations: Channel.Channel<IOperation<typeof placement>, ZerospinError, void>[] =
            [];
          const compacted = makeCompactLayout(payload.visibleLayout);
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

            operations.push(
              makeUpdateOperation({
                model: placement,
                resourceId: makePlacementId(
                  item.i,
                  payload.breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  gridItem: item,
                } as Partial<InferDecodedRow<(typeof placement)["attributes"]>>,
              }),
            );
          }

          return Channel.fromIterable(operations).pipe(Channel.flatMap((operation) => operation));
        }),
      );
    },
  });
}
