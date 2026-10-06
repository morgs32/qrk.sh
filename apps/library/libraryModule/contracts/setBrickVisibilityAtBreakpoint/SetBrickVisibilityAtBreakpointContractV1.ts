import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import { primitives, type InferDecodedRow, type InferIdFromAbbreviation } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

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

  return makeContractVersion(setBrickVisibilityAtBreakpoint, {
    payload: setBrickVisibilityAtBreakpointPayload,
    models: {
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("setBrickVisibilityAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      claims: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof setBrickVisibilityAtBreakpointPayload>;
    }) {
      const brickRow = db.query.brick
        .findFirst({
          where: { id: { eq: payload.brickId } },
        })
        .sync();

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-brick-not-found",
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      const expectedPlacementId = makePlacementId(payload.brickId, payload.breakpoint);
      const placement = db.query.placement
        .findFirst({
          where: { id: { eq: expectedPlacementId } },
        })
        .sync();

      if (placement === undefined) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-placement-not-found",
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }

      if (placement.isVisible !== payload.currentlyVisible) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-current-mismatch",
          message: `placement ${expectedPlacementId} currentlyVisible must be ${placement.isVisible}`,
          status: 409,
        });
      }

      if (payload.savedGridItem.i !== payload.brickId) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-saved-item-mismatch",
          message: `savedGridItem.i must equal brickId ${payload.brickId}`,
          status: 400,
        });
      }

      const otherIds = new Set<string>();
      for (const item of payload.otherVisibleLayout) {
        if (item.i === payload.brickId) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-includes-self",
            message: `otherVisibleLayout must not include brick ${payload.brickId}`,
            status: 400,
          });
        }
        if (otherIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-duplicate-other-item",
            message: `otherVisibleLayout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        otherIds.add(item.i);

        const otherBrick = db.query.brick
          .findFirst({
            where: { id: { eq: item.i } },
          })
          .sync();
        if (otherBrick === undefined || otherBrick.wallId !== brickRow.wallId) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-not-on-wall",
            message: `otherVisibleLayout item ${item.i} is not a brick on the same wall`,
            status: 400,
          });
        }

        const otherPlacement = db.query.placement
          .findFirst({
            where: {
              id: { eq: makePlacementId(item.i, payload.breakpoint) },
            },
          })
          .sync();
        if (otherPlacement === undefined || !otherPlacement.isVisible) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-not-visible",
            message: `otherVisibleLayout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (payload.isVisible && payload.currentlyVisible !== payload.isVisible) {
        const wallBricks = db.query.brick
          .findMany({
            where: { wallId: { eq: brickRow.wallId } },
          })
          .sync();
        const expectedOtherVisibleIds = new Set<string>();
        for (const wallBrick of wallBricks) {
          if (wallBrick.id === payload.brickId) {
            continue;
          }
          const wallPlacement = db.query.placement
            .findFirst({
              where: {
                id: {
                  eq: makePlacementId(wallBrick.id, payload.breakpoint),
                },
              },
            })
            .sync();
          if (wallPlacement !== undefined && wallPlacement.isVisible) {
            expectedOtherVisibleIds.add(wallBrick.id);
          }
        }

        if (otherIds.size !== expectedOtherVisibleIds.size) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-set-mismatch",
            message: `otherVisibleLayout must include exactly the other visible placements at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
        for (const brickId of expectedOtherVisibleIds) {
          if (!otherIds.has(brickId)) {
            return yield* new ZerospinError({
              code: "set-brick-visibility-other-set-mismatch",
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
          return yield* new ZerospinError({
            code: "set-brick-visibility-resolved-invalid",
            message: layoutError,
            status: 400,
          });
        }
      }
    }),
    program: (props) => {
      const { payload, models, db } = props;
      return Effect.gen(function* () {
        if (payload.currentlyVisible === payload.isVisible) {
          return;
        }

        if (!payload.isVisible) {
          yield* models.placement.update({
            resourceId: makePlacementId(
              payload.brickId,
              payload.breakpoint,
            ) as InferIdFromAbbreviation<"plc">,
            attributes: {
              isVisible: false,
            },
          });

          const brickRow = db.query.brick
            .findFirst({ where: { id: { eq: payload.brickId } } })
            .sync();
          if (brickRow === undefined) {
            return;
          }
          const wallBricks = db.query.brick
            .findMany({ where: { wallId: { eq: brickRow.wallId } } })
            .sync();
          const visiblePlacements = [];
          for (const wallBrick of wallBricks) {
            // Emitted updates are not applied to db during this program.
            if (wallBrick.id === payload.brickId) {
              continue;
            }
            const wallPlacement = db.query.placement
              .findFirst({
                where: { id: { eq: makePlacementId(wallBrick.id, payload.breakpoint) } },
              })
              .sync();
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
          return;
        }

        const resolved = makeCollisionResolvedLayout({
          visibleLayout: payload.otherVisibleLayout,
          incoming: cloneLayoutItem(payload.savedGridItem),
        });

        for (const item of resolved) {
          if (item.i === payload.brickId) {
            yield* models.placement.update({
              resourceId: makePlacementId(
                payload.brickId,
                payload.breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
              attributes: {
                isVisible: true,
                gridItem: item,
              } as Partial<InferDecodedRow<(typeof placement)["attributes"]>>,
            });
            continue;
          }

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
