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
import {
  cloneLayoutItem,
  resolveVisibleCollisions,
  visibleLayoutError,
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
  const setBrickVisibilityAtBreakpointPayload = {
    brickId: primitives.foreignKey({
      abbreviation: props.brick.abbreviation,
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
      brick: props.brick,
      placement: props.placement,
    },
    version: "1.0.0",
    guard: Effect.fn("setBrickVisibilityAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
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

      const expectedPlacementId = makePlacementId(
        payload.brickId,
        payload.breakpoint,
      );
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
        if (
          otherBrick === undefined ||
          otherBrick.wallId !== brickRow.wallId
        ) {
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

        const resolved = resolveVisibleCollisions({
          visibleLayout: payload.otherVisibleLayout,
          incoming: payload.savedGridItem,
        });
        const layoutError = visibleLayoutError({
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
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        if (payload.currentlyVisible === payload.isVisible) {
          return [];
        }

        if (!payload.isVisible) {
          return [
            yield* models.placement.update({
              resourceId: makePlacementId(
                payload.brickId,
                payload.breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
              attributes: {
                isVisible: false,
              },
            }),
          ];
        }

        const resolved = resolveVisibleCollisions({
          visibleLayout: payload.otherVisibleLayout,
          incoming: cloneLayoutItem(payload.savedGridItem),
        });
        const mutations = [];

        for (const item of resolved) {
          if (item.i === payload.brickId) {
            mutations.push(
              yield* models.placement.update({
                resourceId: makePlacementId(
                  payload.brickId,
                  payload.breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  isVisible: true,
                  gridItem: structuredClone(item),
                } as Partial<
                  InferDecodedRow<(typeof props.placement)["attributes"]>
                >,
              }),
            );
            continue;
          }

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
