import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { IModelOperations } from "@zerospin/core/contracts/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { mapParseError, ZerospinError } from "@zerospin/error";
import { makeEffectSchema, primitives, type IShape } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementId } from "../../models/placement/makePlacementId";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { updateBrick } from "./updateBrick";

export function makeUpdateBrickContract<
  const LIBRARY extends Record<
    string,
    {
      readonly stateShape: IShape;
      readonly hasPlaceholder: boolean;
    }
  >,
>(props: {
  library: LIBRARY;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { library, brick, placement } = props;
  const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
  const updateBrickPayload = {
    brickId: primitives.foreignKey({
      abbreviation: brick.abbreviation,
    }),
    moduleId: brick.attributes.moduleId,
    state: primitives.json({ schema: Schema.Unknown }),
    measurements: primitives.json({
      nullable: true,
      schema: Schema.Struct({
        sm: placement.attributes.measured.schema,
        md: placement.attributes.measured.schema,
        lg: placement.attributes.measured.schema,
        xl: placement.attributes.measured.schema,
      }),
    }),
  };

  return makeContractVersion(updateBrick, {
    payload: updateBrickPayload,
    models: {
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("updateBrick.guard")(function* (props: {
      claims: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof updateBrickPayload>;
    }) {
      const { db, payload } = props;
      const brickRow = db.query.brick
        .findFirst({
          where: { id: { eq: payload.brickId } },
        })
        .sync();

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: "update-brick-brick-not-found",
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      if (payload.moduleId !== brickRow.moduleId) {
        return yield* new ZerospinError({
          code: "update-brick-module-mismatch",
          message: `brick ${payload.brickId} does not belong to module ${payload.moduleId}`,
          status: 400,
        });
      }

      const brickModule = library[brickRow.moduleId];
      const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
      yield* Schema.decodeUnknownEffect(
        brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
      )(payload.state, { onExcessProperty: "ignore" }).pipe(
        mapParseError({
          code: "update-brick-invalid-state",
          prefix: `updateBrick state failed ${brickRow.moduleId} decode`,
        }),
      );

      for (const breakpoint of breakpoints) {
        const placementId = makePlacementId(payload.brickId, breakpoint);
        const placementRow = db.query.placement
          .findFirst({ where: { id: { eq: placementId } } })
          .sync();
        if (placementRow === undefined) {
          return yield* new ZerospinError({
            code: "update-brick-placement-not-found",
            message: `placement ${placementId} was not found`,
            status: 404,
          });
        }
        if (placementRow.brickId !== payload.brickId || placementRow.breakpoint !== breakpoint) {
          return yield* new ZerospinError({
            code: "update-brick-placement-mismatch",
            message: `placement ${placementId} does not belong to brick ${payload.brickId} at ${breakpoint}`,
            status: 400,
          });
        }
      }
    }),
    program: Effect.fn("updateBrick.program")(function* (props: {
      payload: InferCommandPayload<typeof updateBrickPayload>;
      models: {
        brick: IModelOperations<typeof brick>;
        placement: IModelOperations<typeof placement>;
      };
    }) {
      const { payload, models } = props;
      const brickModule = library[payload.moduleId];
      const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
      const decodedState = yield* Schema.decodeUnknownEffect(
        brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
      )(payload.state, { onExcessProperty: "ignore" }).pipe(
        mapParseError({
          code: "update-brick-invalid-state",
          prefix: `updateBrick state failed ${payload.moduleId} decode`,
        }),
      );
      yield* models.brick.update({
        resourceId: payload.brickId,
        attributes: {
          state: structuredClone(decodedState),
        },
      });
      for (const breakpoint of breakpoints) {
        yield* models.placement.update({
          resourceId: makePlacementId(payload.brickId, breakpoint),
          attributes: {
            measured:
              payload.measurements === null
                ? null
                : structuredClone(payload.measurements[breakpoint]),
          },
        });
      }
    }),
  });
}
