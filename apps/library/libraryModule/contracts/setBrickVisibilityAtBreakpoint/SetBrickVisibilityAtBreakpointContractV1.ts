import { ContractError } from "@zerospin/error";
import { findMany } from "@zerospin/core/contracts/findMany";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import type { IOperation } from "@zerospin/core/contracts/types";
import { makeUpdateOperation } from "@zerospin/core/contracts/make/makeUpdateOperation";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { mapParseError, ZerospinError } from "@zerospin/error";
import { primitives, type InferDecodedRow, type InferIdFromAbbreviation } from "@zerospin/shapes";
import { Channel, Effect, Schema } from "effect";

import { makePlacementId } from "../../models/placement/makePlacementId";
import {
  cloneLayoutItem,
  makeCollisionResolvedLayout,
  makeCompactLayout,
  findVisibleLayoutError,
} from "../../resolveVisibleCollisions";
import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { setBrickVisibilityAtBreakpoint } from "./setBrickVisibilityAtBreakpoint";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

export function makeSetBrickVisibilityAtBreakpointContract(props: {
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { brick, placement } = props;
  const setBrickVisibilityAtBreakpointPayload = {
    brickId: primitives.foreignKey({
      abbreviation: brick.abbreviation,
    }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    isVisible: primitives.boolean(),
    currentlyVisible: primitives.boolean(),
    savedGridItem: primitives.json({ schema: gridItemSchema }),
    otherVisibleLayout: primitives.json({
      schema: Schema.Array(gridItemSchema),
    }),
  };

  return makeAggregateContractVersion(setBrickVisibilityAtBreakpoint, {
    failures: {
      setBrickVisibilityBrickNotFound: ContractError.schema({
        code: "set-brick-visibility-brick-not-found",
      }),
      setBrickVisibilityPlacementNotFound: ContractError.schema({
        code: "set-brick-visibility-placement-not-found",
      }),
      setBrickVisibilityCurrentMismatch: ContractError.schema({
        code: "set-brick-visibility-current-mismatch",
      }),
      setBrickVisibilitySavedItemMismatch: ContractError.schema({
        code: "set-brick-visibility-saved-item-mismatch",
      }),
      setBrickVisibilityOtherIncludesSelf: ContractError.schema({
        code: "set-brick-visibility-other-includes-self",
      }),
      setBrickVisibilityDuplicateOtherItem: ContractError.schema({
        code: "set-brick-visibility-duplicate-other-item",
      }),
      setBrickVisibilityOtherNotOnWall: ContractError.schema({
        code: "set-brick-visibility-other-not-on-wall",
      }),
      setBrickVisibilityOtherNotVisible: ContractError.schema({
        code: "set-brick-visibility-other-not-visible",
      }),
      setBrickVisibilityOtherSetMismatch: ContractError.schema({
        code: "set-brick-visibility-other-set-mismatch",
      }),
      setBrickVisibilityResolvedInvalid: ContractError.schema({
        code: "set-brick-visibility-resolved-invalid",
      }),
    },

    payload: setBrickVisibilityAtBreakpointPayload,
    models: {
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("setBrickVisibilityAtBreakpoint.guard")(function* (props) {
      const { failures, db, payload } = props;

      const brickRow = yield* findFirst({
        db: db,
        model: brick,
        where: { id: { eq: payload.brickId } },
      });

      if (brickRow === undefined) {
        return yield* failures.setBrickVisibilityBrickNotFound.make({
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      const expectedPlacementId = makePlacementId(payload.brickId, payload.breakpoint);
      const placementRow = yield* findFirst({
        db: db,
        model: placement,
        where: { id: { eq: expectedPlacementId } },
      });

      if (placementRow === undefined) {
        return yield* failures.setBrickVisibilityPlacementNotFound.make({
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }

      if (placementRow.isVisible !== payload.currentlyVisible) {
        return yield* failures.setBrickVisibilityCurrentMismatch.make({
          message: `placement ${expectedPlacementId} currentlyVisible must be ${placementRow.isVisible}`,
          status: 409,
        });
      }

      if (payload.savedGridItem.i !== payload.brickId) {
        return yield* failures.setBrickVisibilitySavedItemMismatch.make({
          message: `savedGridItem.i must equal brickId ${payload.brickId}`,
          status: 400,
        });
      }

      const otherIds = new Set<string>();
      for (const item of payload.otherVisibleLayout) {
        if (item.i === payload.brickId) {
          return yield* failures.setBrickVisibilityOtherIncludesSelf.make({
            message: `otherVisibleLayout must not include brick ${payload.brickId}`,
            status: 400,
          });
        }
        if (otherIds.has(item.i)) {
          return yield* failures.setBrickVisibilityDuplicateOtherItem.make({
            message: `otherVisibleLayout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        otherIds.add(item.i);

        const otherBrick = yield* findFirst({
          db: db,
          model: brick,
          where: {
            id: {
              eq: yield* Schema.decodeUnknownEffect(
                Schema.TemplateLiteral(["brk_", Schema.String]),
              )(item.i).pipe(
                mapParseError({
                  code: "set-brick-visibility-other-not-on-wall",
                  prefix: "otherVisibleLayout item must identify a brick on the same wall",
                }),
              ),
            },
          },
        });
        if (otherBrick === undefined || otherBrick.wallId !== brickRow.wallId) {
          return yield* failures.setBrickVisibilityOtherNotOnWall.make({
            message: `otherVisibleLayout item ${item.i} is not a brick on the same wall`,
            status: 400,
          });
        }

        const otherPlacement = yield* findFirst({
          db: db,
          model: placement,
          where: {
            id: { eq: makePlacementId(item.i, payload.breakpoint) },
          },
        });
        if (otherPlacement === undefined || !otherPlacement.isVisible) {
          return yield* failures.setBrickVisibilityOtherNotVisible.make({
            message: `otherVisibleLayout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (payload.isVisible && payload.currentlyVisible !== payload.isVisible) {
        const wallBricks = yield* findMany({
          db: db,
          model: brick,
          where: { wallId: { eq: brickRow.wallId } },
        });
        const expectedOtherVisibleIds = new Set<string>();
        for (const wallBrick of wallBricks) {
          if (wallBrick.id === payload.brickId) {
            continue;
          }
          const wallPlacement = yield* findFirst({
            db: db,
            model: placement,
            where: {
              id: {
                eq: makePlacementId(wallBrick.id, payload.breakpoint),
              },
            },
          });
          if (wallPlacement !== undefined && wallPlacement.isVisible) {
            expectedOtherVisibleIds.add(wallBrick.id);
          }
        }

        if (otherIds.size !== expectedOtherVisibleIds.size) {
          return yield* failures.setBrickVisibilityOtherSetMismatch.make({
            message: `otherVisibleLayout must include exactly the other visible placements at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
        for (const brickId of expectedOtherVisibleIds) {
          if (!otherIds.has(brickId)) {
            return yield* failures.setBrickVisibilityOtherSetMismatch.make({
              message: `otherVisibleLayout is missing visible brick ${brickId}`,
              status: 400,
            });
          }
        }

        const resolved = makeCollisionResolvedLayout({
          visibleLayout: payload.otherVisibleLayout,
          incoming: payload.savedGridItem,
        });
        const layoutError = findVisibleLayoutError({
          layout: resolved,
          context: "setBrickVisibilityAtBreakpoint",
        });
        if (layoutError !== null) {
          return yield* failures.setBrickVisibilityResolvedInvalid.make({
            message: layoutError,
            status: 400,
          });
        }
      }
    }),
    program: (props) => {
      const { payload, db } = props;
      return Channel.unwrap(
        Effect.gen(function* () {
          const operations: Channel.Channel<IOperation<typeof placement>, ZerospinError, void>[] =
            [];
          if (payload.currentlyVisible === payload.isVisible) {
            return Channel.empty;
          }

          if (!payload.isVisible) {
            operations.push(
              makeUpdateOperation({
                model: placement,
                resourceId: makePlacementId(
                  payload.brickId,
                  payload.breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  isVisible: false,
                },
              }),
            );

            const brickRow = yield* findFirst({
              db: db,
              model: brick,
              where: { id: { eq: payload.brickId } },
            });
            if (brickRow === undefined) {
              return Channel.fromIterable(operations).pipe(
                Channel.flatMap((operation) => operation),
              );
            }
            const wallBricks = yield* findMany({
              db: db,
              model: brick,
              where: { wallId: { eq: brickRow.wallId } },
            });
            const visiblePlacements = [];
            for (const wallBrick of wallBricks) {
              // Emitted updates are not applied to db during this program.
              if (wallBrick.id === payload.brickId) {
                continue;
              }
              const wallPlacement = yield* findFirst({
                db: db,
                model: placement,
                where: { id: { eq: makePlacementId(wallBrick.id, payload.breakpoint) } },
              });
              if (wallPlacement !== undefined && wallPlacement.isVisible) {
                visiblePlacements.push(wallPlacement);
              }
            }

            const compacted = makeCompactLayout(
              visiblePlacements.map((wallPlacement) => wallPlacement.gridItem),
            );
            for (const item of compacted) {
              const stored = visiblePlacements.find(
                (wallPlacement) => wallPlacement.gridItem.i === item.i,
              )?.gridItem;
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
          }

          const resolved = makeCollisionResolvedLayout({
            visibleLayout: payload.otherVisibleLayout,
            incoming: cloneLayoutItem(payload.savedGridItem),
          });

          for (const item of resolved) {
            if (item.i === payload.brickId) {
              operations.push(
                makeUpdateOperation({
                  model: placement,
                  resourceId: makePlacementId(
                    payload.brickId,
                    payload.breakpoint,
                  ) as InferIdFromAbbreviation<"plc">,
                  attributes: {
                    isVisible: true,
                    gridItem: item,
                  } as Partial<InferDecodedRow<(typeof placement)["attributes"]>>,
                }),
              );
              continue;
            }

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
