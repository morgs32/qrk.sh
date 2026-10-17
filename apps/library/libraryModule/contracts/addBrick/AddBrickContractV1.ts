import { ContractError } from "@zerospin/error";
import { findMany } from "@zerospin/core/contracts/findMany";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { mapParseError } from "@zerospin/error";
import {
  makeEffectSchema,
  primitives,
  type IInferDecodedRow,
  type IInferIdFromAbbreviation,
  type IShape,
} from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import type { defineComponent } from "../../../make/defineComponent";
import { makeModuleSpecDocumentSchema } from "../../../make/makeModuleSpecDocumentSchema";
import { makePlacementId } from "../../models/placement/makePlacementId";
import {
  makeCollisionResolvedLayout,
  findVisibleLayoutError,
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
      readonly hasPlaceholder: boolean;
      readonly maxPerPage?: number;
      readonly components: Record<string, ReturnType<typeof defineComponent>>;
    }
  >,
>(props: {
  library: LIBRARY;
  wall: typeof wallModelV1;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { library, wall, brick, placement } = props;
  const addBrickPayload = {
    wallId: primitives.foreignKey({ abbreviation: wall.abbreviation }),
    brickId: primitives.foreignKey({
      abbreviation: brick.abbreviation,
    }),
    moduleId: brick.attributes.moduleId,
    state: primitives.json({ schema: Schema.Unknown }),
    spec: primitives.json({ schema: structuralSpecSchema }),
    dropPosition: primitives.json({
      schema: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
    }),
    visibleLayouts: primitives.json({
      schema: Schema.Struct({
        sm: Schema.Array(gridItemSchema),
        md: Schema.Array(gridItemSchema),
        lg: Schema.Array(gridItemSchema),
        xl: Schema.Array(gridItemSchema),
      }),
    }),
    placementSizes: primitives.json({
      schema: Schema.Struct({
        sm: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
        md: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
        lg: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
        xl: Schema.Struct({ w: Schema.Number, h: Schema.Number }),
      }),
    }),
  };

  return makeAggregateContractVersion(addBrick, {
    operations: {
      createBrick: brick.operations.create,
      createPlacement: placement.operations.create,
      updatePlacement: placement.operations.update,
    },
    failures: {
      addBrickWallNotFound: ContractError.schema({ code: "add-brick-wall-not-found" }),
      addBrickBrickExists: ContractError.schema({ code: "add-brick-brick-exists" }),
      addBrickModuleLimitReached: ContractError.schema({ code: "add-brick-module-limit-reached" }),
      addBrickPlacementExists: ContractError.schema({ code: "add-brick-placement-exists" }),
      addBrickDropPositionInvalid: ContractError.schema({
        code: "add-brick-drop-position-invalid",
      }),
      addBrickPlacementSizeInvalid: ContractError.schema({
        code: "add-brick-placement-size-invalid",
      }),
      addBrickVisibleLayoutConflict: ContractError.schema({
        code: "add-brick-visible-layout-conflict",
      }),
      addBrickVisibleLayoutInvalid: ContractError.schema({
        code: "add-brick-visible-layout-invalid",
      }),
      addBrickResolvedLayoutInvalid: ContractError.schema({
        code: "add-brick-resolved-layout-invalid",
      }),
    },

    payload: addBrickPayload,
    models: {
      wall,
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("addBrick.guard")(function* (props) {
      const { failures, db, payload } = props;

      const wallRow = yield* findFirst({
        db: db,
        model: wall,
        where: { id: { eq: payload.wallId } },
      });

      if (wallRow === undefined) {
        return yield* failures.addBrickWallNotFound.make({
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const existingBrick = yield* findFirst({
        db: db,
        model: brick,
        where: { id: { eq: payload.brickId } },
      });
      if (existingBrick !== undefined) {
        return yield* failures.addBrickBrickExists.make({
          message: `brick ${payload.brickId} already exists`,
          status: 409,
        });
      }

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
        const placementId = makePlacementId(payload.brickId, breakpoint);
        const existingPlacement = yield* findFirst({
          db: db,
          model: placement,
          where: { id: { eq: placementId } },
        });
        if (existingPlacement !== undefined) {
          return yield* failures.addBrickPlacementExists.make({
            message: `placement ${placementId} already exists`,
            status: 409,
          });
        }
      }

      const brickModule = library[payload.moduleId];
      const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
      yield* Schema.decodeUnknownEffect(
        brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
      )(payload.state, { onExcessProperty: "ignore" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: `addBrick state failed ${payload.moduleId} decode`,
        }),
      );
      yield* Schema.decodeUnknownEffect(makeModuleSpecDocumentSchema(brickModule.components))(
        payload.spec,
        { onExcessProperty: "error" },
      ).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: `addBrick spec failed ${payload.moduleId} decode`,
        }),
      );

      if (
        !Number.isInteger(payload.dropPosition.x) ||
        payload.dropPosition.x < 0 ||
        !Number.isInteger(payload.dropPosition.y) ||
        payload.dropPosition.y < 0
      ) {
        return yield* failures.addBrickDropPositionInvalid.make({
          message: "dropPosition must contain nonnegative integer x and y",
          status: 400,
        });
      }
      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
        const size = payload.placementSizes[breakpoint];
        if (!Number.isInteger(size.w) || size.w < 1 || !Number.isInteger(size.h) || size.h < 1) {
          return yield* failures.addBrickPlacementSizeInvalid.make({
            message: `placementSizes.${breakpoint} must contain positive integer w and h`,
            status: 400,
          });
        }
      }

      const wallBricks = yield* findMany({
        db: db,
        model: brick,
        where: { wallId: { eq: payload.wallId } },
      });
      const { maxPerPage } = brickModule;
      if (
        maxPerPage !== undefined &&
        wallBricks.filter((wallBrick) => wallBrick.moduleId === payload.moduleId).length >=
          maxPerPage
      ) {
        return yield* failures.addBrickModuleLimitReached.make({
          message: `The ${payload.moduleId} limit of ${maxPerPage} per page has been reached`,
          status: 409,
        });
      }

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
        const visibleItems = [];
        for (const wallBrick of wallBricks) {
          const placementRow = yield* findFirst({
            db: db,
            model: placement,
            where: { id: { eq: makePlacementId(wallBrick.id, breakpoint) } },
          });
          if (placementRow !== undefined && placementRow.isVisible) {
            visibleItems.push(placementRow.gridItem);
          }
        }

        const snapshot = payload.visibleLayouts[breakpoint];
        const snapshotIds = new Set(snapshot.map((item) => item.i));
        if (
          snapshotIds.size !== snapshot.length ||
          snapshot.length !== visibleItems.length ||
          visibleItems.some(
            (stored) =>
              !snapshot.some(
                (item) =>
                  item.i === stored.i &&
                  item.x === stored.x &&
                  item.y === stored.y &&
                  item.w === stored.w &&
                  item.h === stored.h,
              ),
          )
        ) {
          return yield* failures.addBrickVisibleLayoutConflict.make({
            message: `visibleLayouts.${breakpoint} must match the wall's current visible placements`,
            status: 409,
          });
        }
        const layoutError = findVisibleLayoutError({
          layout: snapshot,
          context: `addBrick.visibleLayouts.${breakpoint}`,
        });
        if (layoutError !== null) {
          return yield* failures.addBrickVisibleLayoutInvalid.make({
            message: layoutError,
            status: 400,
          });
        }
      }
    }),
    program: (props) => {
      const { operations, failures, payload } = props;
      return Effect.gen(function* () {
        const resolvedLayouts = { ...payload.visibleLayouts };
        for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
          const layout = makeCollisionResolvedLayout({
            visibleLayout: payload.visibleLayouts[breakpoint],
            incoming: {
              i: payload.brickId,
              ...payload.dropPosition,
              ...payload.placementSizes[breakpoint],
            },
          });
          const layoutError = findVisibleLayoutError({
            layout,
            context: `addBrick.resolvedLayouts.${breakpoint}`,
          });
          if (layoutError !== null) {
            return yield* failures.addBrickResolvedLayoutInvalid.make({
              message: layoutError,
              status: 400,
            });
          }
          resolvedLayouts[breakpoint] = layout;
        }

        const brickModule = library[payload.moduleId];
        const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
        const decodedState = yield* Schema.decodeUnknownEffect(
          brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
        )(payload.state, { onExcessProperty: "ignore" }).pipe(
          mapParseError({
            code: "add-brick-invalid-state",
            prefix: `addBrick state failed ${payload.moduleId} decode`,
          }),
        );
        const clonedState = structuredClone(decodedState);
        const clonedSpec = structuredClone(payload.spec);

        yield* operations.createBrick({
          resourceId: payload.brickId as IInferIdFromAbbreviation<"brk">,
          attributes: {
            wallId: payload.wallId as IInferIdFromAbbreviation<"wal">,
            moduleId: payload.moduleId,
            state: clonedState,
            stateRevision: 0,
          },
        });

        for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
          const layout = resolvedLayouts[breakpoint];

          for (const item of layout) {
            if (item.i === payload.brickId) {
              yield* operations.createPlacement({
                resourceId: makePlacementId(
                  payload.brickId,
                  breakpoint,
                ) as IInferIdFromAbbreviation<"plc">,
                attributes: {
                  brickId: payload.brickId as IInferIdFromAbbreviation<"brk">,
                  breakpoint,
                  spec: structuredClone(clonedSpec),
                  specRevision: 0,
                  generation: null,
                  measured: null,
                  gridItem: item,
                  isVisible: true,
                } as IInferDecodedRow<(typeof placement)["attributes"]>,
              });
              continue;
            }

            const previous = payload.visibleLayouts[breakpoint].find(
              (visible) => visible.i === item.i,
            );
            if (
              previous?.x === item.x &&
              previous.y === item.y &&
              previous.w === item.w &&
              previous.h === item.h
            ) {
              continue;
            }

            yield* operations.updatePlacement({
              resourceId: makePlacementId(item.i, breakpoint) as IInferIdFromAbbreviation<"plc">,
              attributes: {
                gridItem: item,
              } as Partial<IInferDecodedRow<(typeof placement)["attributes"]>>,
            });
          }
        }
      });
    },
  });
}
