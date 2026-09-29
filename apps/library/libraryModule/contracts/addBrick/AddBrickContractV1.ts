import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { IModelMutations } from "@zerospin/core/contracts/types";
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

  return makeContractVersion(addBrick, {
    payload: addBrickPayload,
    models: {
      wall: props.wall,
      brick: props.brick,
      placement: props.placement,
    },
    version: "1.0.0",
    guard: Effect.fn("addBrick.guard")(function* ({
      queryDb: db,
      payload,
    }: {
      claims: Readonly<Record<string, unknown>> | null;
      queryDb: Readonly<Pick<IDb, "query">>;
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

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
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
      yield* Schema.decodeUnknownEffect(Schema.toType(makeEffectSchema(brickModule.stateShape)))(
        payload.state,
        { onExcessProperty: "error" },
      ).pipe(
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
        return yield* new ZerospinError({
          code: "add-brick-drop-position-invalid",
          message: "dropPosition must contain nonnegative integer x and y",
          status: 400,
        });
      }
      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
        const size = payload.placementSizes[breakpoint];
        if (!Number.isInteger(size.w) || size.w < 1 || !Number.isInteger(size.h) || size.h < 1) {
          return yield* new ZerospinError({
            code: "add-brick-placement-size-invalid",
            message: `placementSizes.${breakpoint} must contain positive integer w and h`,
            status: 400,
          });
        }
      }

      const wallBricks = db.query.brick
        .findMany({
          where: { wallId: { eq: payload.wallId } },
        })
        .sync();

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
        const visibleItems = [];
        for (const wallBrick of wallBricks) {
          const placement = db.query.placement
            .findFirst({ where: { id: { eq: makePlacementId(wallBrick.id, breakpoint) } } })
            .sync();
          if (placement !== undefined && placement.isVisible) {
            visibleItems.push(placement.gridItem);
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
          return yield* new ZerospinError({
            code: "add-brick-visible-layout-conflict",
            message: `visibleLayouts.${breakpoint} must match the wall's current visible placements`,
            status: 409,
          });
        }
        const layoutError = findVisibleLayoutError({
          layout: snapshot,
          context: `addBrick.visibleLayouts.${breakpoint}`,
        });
        if (layoutError !== null) {
          return yield* new ZerospinError({
            code: "add-brick-visible-layout-invalid",
            message: layoutError,
            status: 400,
          });
        }
      }
    }),
    program: Effect.fn("addBrick.program")(function* ({
      payload,
      models,
    }: {
      payload: InferCommandPayload<typeof addBrickPayload>;
      models: {
        brick: IModelMutations<typeof props.brick>;
        placement: IModelMutations<typeof props.placement>;
      };
    }) {
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
          return yield* new ZerospinError({
            code: "add-brick-resolved-layout-invalid",
            message: layoutError,
            status: 400,
          });
        }
        resolvedLayouts[breakpoint] = layout;
      }

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

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
        const layout = resolvedLayouts[breakpoint];

        for (const item of layout) {
          if (item.i === payload.brickId) {
            mutations.push(
              yield* models.placement.create({
                resourceId: makePlacementId(
                  payload.brickId,
                  breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  brickId: payload.brickId as InferIdFromAbbreviation<"brk">,
                  breakpoint,
                  spec: structuredClone(clonedSpec),
                  gridItem: item,
                  isVisible: true,
                } as InferDecodedRow<(typeof props.placement)["attributes"]>,
              }),
            );
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

          mutations.push(
            yield* models.placement.update({
              resourceId: makePlacementId(item.i, breakpoint) as InferIdFromAbbreviation<"plc">,
              attributes: {
                gridItem: item,
              } as Partial<InferDecodedRow<(typeof props.placement)["attributes"]>>,
            }),
          );
        }
      }

      return mutations;
    }),
  });
}
