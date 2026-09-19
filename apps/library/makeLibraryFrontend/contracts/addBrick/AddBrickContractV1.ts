import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { mapParseError, ZerospinError } from "@zerospin/error";
import {
  makeEffectSchema,
  primitives,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
  type IShape,
} from "@zerospin/schema";
import { Effect, Schema } from "effect";

import type { defineComponent } from "../../../make/defineComponent";
import { makeModuleSpecDocumentSchema } from "../../../make/makeModuleSpecDocumentSchema";
import { makePlacementId } from "../../models/placement/makePlacementId";
import {
  cloneLayoutItem,
  resolveVisibleCollisions,
  visibleLayoutError,
} from "../../resolveVisibleCollisions";
import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { addBrick } from "./addBrick";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

function toStoredGridItem(item: { i: string; x: number; y: number; w: number; h: number }) {
  return {
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  };
}

const structuralSpecSchema = Schema.Struct({
  root: Schema.String,
  elements: Schema.Record(Schema.String, Schema.Unknown),
  state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

export function makeAddBrickContract<
  const LIBRARY extends Record<
    string,
    {
      readonly stateShape: IShape;
      readonly components: Record<string, ReturnType<typeof defineComponent>>;
    }
  >,
>(props: {
  library: LIBRARY;
  wall: typeof wallModelV1;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const addBrickPayload = {
    wallId: primitives.foreignKey({ abbreviation: props.wall.abbreviation }),
    brickId: primitives.foreignKey({
      abbreviation: props.brick.abbreviation,
    }),
    moduleId: props.brick.attributes.moduleId,
    state: primitives.json({ schema: Schema.Unknown }),
    spec: primitives.json({ schema: structuralSpecSchema }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    droppedItem: primitives.json({ schema: gridItemSchema }),
    resolvedActiveLayout: primitives.json({
      schema: Schema.Array(gridItemSchema),
    }),
    otherBreakpointVisibleLayouts: primitives.json({
      schema: Schema.Struct({
        sm: Schema.Array(gridItemSchema),
        md: Schema.Array(gridItemSchema),
        lg: Schema.Array(gridItemSchema),
        xl: Schema.Array(gridItemSchema),
      }),
    }),
  };

  return makeContractVersion(addBrick, {
    payload: addBrickPayload,
    models: {
      wall: props.wall,
      brick: props.brick,
      placement: props.placement,
    },
    version: "1.0.0",
    guard: Effect.fn("addBrick.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof addBrickPayload>;
    }) {
      const wall = db.query.wall
        .findFirst({
          where: { id: { eq: payload.wallId } },
        })
        .sync();

      if (wall === undefined) {
        return yield* new ZerospinError({
          code: "add-brick-wall-not-found",
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const existingBrick = db.query.brick
        .findFirst({
          where: { id: { eq: payload.brickId } },
        })
        .sync();
      if (existingBrick !== undefined) {
        return yield* new ZerospinError({
          code: "add-brick-brick-exists",
          message: `brick ${payload.brickId} already exists`,
          status: 409,
        });
      }

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
        "sm" | "md" | "lg" | "xl"
      >) {
        const placementId = makePlacementId(payload.brickId, breakpoint);
        const existingPlacement = db.query.placement
          .findFirst({
            where: { id: { eq: placementId } },
          })
          .sync();
        if (existingPlacement !== undefined) {
          return yield* new ZerospinError({
            code: "add-brick-placement-exists",
            message: `placement ${placementId} already exists`,
            status: 409,
          });
        }
      }

      const brickModule = props.library[payload.moduleId];
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(brickModule.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: `addBrick state failed ${payload.moduleId} decode`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(brickModule.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: `addBrick spec failed ${payload.moduleId} decode`,
        }),
      );

      if (payload.droppedItem.i !== payload.brickId) {
        return yield* new ZerospinError({
          code: "add-brick-dropped-item-mismatch",
          message: `droppedItem.i must equal brickId ${payload.brickId}`,
          status: 400,
        });
      }

      const activeLayoutError = visibleLayoutError({
        layout: payload.resolvedActiveLayout,
        context: "addBrick.resolvedActiveLayout",
      });
      if (activeLayoutError !== null) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-active-invalid",
          message: activeLayoutError,
          status: 400,
        });
      }

      const resolvedIncludesBrick = payload.resolvedActiveLayout.some(
        item => item.i === payload.brickId,
      );
      if (!resolvedIncludesBrick) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-missing-brick",
          message: `resolvedActiveLayout must include brick ${payload.brickId}`,
          status: 400,
        });
      }

      const wallBricks = db.query.brick
        .findMany({
          where: { wallId: { eq: payload.wallId } },
        })
        .sync();

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
        "sm" | "md" | "lg" | "xl"
      >) {
        const visibleBrickIds = new Set<string>();
        for (const wallBrick of wallBricks) {
          const placement = db.query.placement
            .findFirst({
              where: {
                id: { eq: makePlacementId(wallBrick.id, breakpoint) },
              },
            })
            .sync();
          if (placement !== undefined && placement.isVisible) {
            visibleBrickIds.add(wallBrick.id);
          }
        }

        const preDropLayout = payload.otherBreakpointVisibleLayouts[breakpoint];
        const preDropIds = new Set<string>();
        for (const item of preDropLayout) {
          if (preDropIds.has(item.i)) {
            return yield* new ZerospinError({
              code: "add-brick-layout-duplicate-item",
              message: `otherBreakpointVisibleLayouts.${breakpoint} repeats item ${item.i}`,
              status: 400,
            });
          }
          preDropIds.add(item.i);

          if (item.i === payload.brickId) {
            return yield* new ZerospinError({
              code: "add-brick-layout-includes-new-brick",
              message: `otherBreakpointVisibleLayouts.${breakpoint} must not include new brick ${payload.brickId}`,
              status: 400,
            });
          }

          if (!visibleBrickIds.has(item.i)) {
            return yield* new ZerospinError({
              code: "add-brick-layout-item-not-visible",
              message: `layout item ${item.i} is not a visible placement on wall ${payload.wallId} at ${breakpoint}`,
              status: 400,
            });
          }
        }

        if (preDropIds.size !== visibleBrickIds.size) {
          return yield* new ZerospinError({
            code: "add-brick-layout-set-mismatch",
            message: `otherBreakpointVisibleLayouts.${breakpoint} must match the wall's current visible placements`,
            status: 400,
          });
        }

        for (const brickId of visibleBrickIds) {
          if (!preDropIds.has(brickId)) {
            return yield* new ZerospinError({
              code: "add-brick-layout-set-mismatch",
              message: `otherBreakpointVisibleLayouts.${breakpoint} is missing visible brick ${brickId}`,
              status: 400,
            });
          }
        }

        const otherLayoutError = visibleLayoutError({
          layout: preDropLayout,
          context: `addBrick.otherBreakpointVisibleLayouts.${breakpoint}`,
        });
        if (otherLayoutError !== null) {
          return yield* new ZerospinError({
            code: "add-brick-other-layout-invalid",
            message: otherLayoutError,
            status: 400,
          });
        }
      }

      const activeNeighborIds = new Set<string>();
      for (const item of payload.resolvedActiveLayout) {
        if (item.i === payload.brickId) {
          continue;
        }
        if (activeNeighborIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "add-brick-resolved-duplicate-neighbor",
            message: `resolvedActiveLayout repeats neighbor ${item.i}`,
            status: 400,
          });
        }
        activeNeighborIds.add(item.i);

        const neighborBrick = wallBricks.find(
          wallBrick => wallBrick.id === item.i,
        );
        if (neighborBrick === undefined) {
          return yield* new ZerospinError({
            code: "add-brick-resolved-neighbor-not-on-wall",
            message: `resolvedActiveLayout neighbor ${item.i} is not a brick on wall ${payload.wallId}`,
            status: 400,
          });
        }

        const neighborPlacement = db.query.placement
          .findFirst({
            where: {
              id: {
                eq: makePlacementId(item.i, payload.breakpoint),
              },
            },
          })
          .sync();
        if (neighborPlacement === undefined || !neighborPlacement.isVisible) {
          return yield* new ZerospinError({
            code: "add-brick-resolved-neighbor-not-visible",
            message: `resolvedActiveLayout neighbor ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      const activeVisibleNeighborIds = new Set<string>();
      for (const wallBrick of wallBricks) {
        const placement = db.query.placement
          .findFirst({
            where: {
              id: {
                eq: makePlacementId(wallBrick.id, payload.breakpoint),
              },
            },
          })
          .sync();
        if (placement !== undefined && placement.isVisible) {
          activeVisibleNeighborIds.add(wallBrick.id);
        }
      }

      if (activeNeighborIds.size !== activeVisibleNeighborIds.size) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-neighbor-set-mismatch",
          message: `resolvedActiveLayout neighbors must match current visible placements at ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const brickId of activeVisibleNeighborIds) {
        if (!activeNeighborIds.has(brickId)) {
          return yield* new ZerospinError({
            code: "add-brick-resolved-neighbor-set-mismatch",
            message: `resolvedActiveLayout is missing visible neighbor ${brickId}`,
            status: 400,
          });
        }
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        const mutations = [];
        const clonedState = structuredClone(payload.state);
        const clonedSpec = structuredClone(payload.spec);

        mutations.push(
          yield* models.brick.create({
            resourceId: payload.brickId as InferIdFromAbbreviation<"brk">,
            attributes: {
              wallId: payload.wallId as InferIdFromAbbreviation<"wal">,
              moduleId: payload.moduleId,
              state: clonedState,
            },
          }),
        );

        for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
          "sm" | "md" | "lg" | "xl"
        >) {
          const layout =
            breakpoint === payload.breakpoint
              ? payload.resolvedActiveLayout
              : resolveVisibleCollisions({
                  visibleLayout:
                    payload.otherBreakpointVisibleLayouts[breakpoint],
                  incoming: cloneLayoutItem(payload.droppedItem),
                });

          for (const item of layout) {
            if (item.i === payload.brickId) {
              mutations.push(
                yield* models.placement.create({
                  resourceId: makePlacementId(
                    payload.brickId,
                    breakpoint,
                  ) as InferIdFromAbbreviation<"plc">,
                  attributes: {
                    brickId:
                      payload.brickId as InferIdFromAbbreviation<"brk">,
                    breakpoint,
                    spec: structuredClone(clonedSpec),
                    gridItem: toStoredGridItem(item),
                    isVisible: true,
                  } as InferDecodedRow<
                    (typeof props.placement)["attributes"]
                  >,
                }),
              );
              continue;
            }

            mutations.push(
              yield* models.placement.update({
                resourceId: makePlacementId(
                  item.i,
                  breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  gridItem: toStoredGridItem(item),
                } as Partial<
                  InferDecodedRow<(typeof props.placement)["attributes"]>
                >,
              }),
            );
          }
        }

        return mutations;
      }),
  });
}
