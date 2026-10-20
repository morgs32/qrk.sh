import { ContractError } from "@zerospin/error";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { mapParseError } from "@zerospin/error";
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
  };

  return makeAggregateContractVersion(updateBrick, {
    operations: {
      updateBrick: brick.operations.update,
      updatePlacement: placement.operations.update,
    },
    failures: {
      updateBrickBrickNotFound: ContractError.schema({ code: "update-brick-brick-not-found" }),
      updateBrickModuleMismatch: ContractError.schema({ code: "update-brick-module-mismatch" }),
      updateBrickPlacementNotFound: ContractError.schema({
        code: "update-brick-placement-not-found",
      }),
      updateBrickPlacementMismatch: ContractError.schema({
        code: "update-brick-placement-mismatch",
      }),
    },

    payload: updateBrickPayload,
    models: {
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("updateBrick.guard")(function* (props) {
      const { failures, db, payload } = props;
      const brickRow = yield* findFirst({
        db: db,
        model: brick,
        where: { id: { eq: payload.brickId } },
      });

      if (brickRow === undefined) {
        return yield* failures.updateBrickBrickNotFound.make({
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      if (payload.moduleId !== brickRow.moduleId) {
        return yield* failures.updateBrickModuleMismatch.make({
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
        const placementRow = yield* findFirst({
          db: db,
          model: placement,
          where: { id: { eq: placementId } },
        });
        if (placementRow === undefined) {
          return yield* failures.updateBrickPlacementNotFound.make({
            message: `placement ${placementId} was not found`,
            status: 404,
          });
        }
        if (placementRow.brickId !== payload.brickId || placementRow.breakpoint !== breakpoint) {
          return yield* failures.updateBrickPlacementMismatch.make({
            message: `placement ${placementId} does not belong to brick ${payload.brickId} at ${breakpoint}`,
            status: 400,
          });
        }
      }
    }),
    program: (props) => {
      const { operations, payload, db } = props;
      return Effect.gen(function* () {
        const currentBrick = yield* findFirst({
          db,
          model: brick,
          where: { id: { eq: payload.brickId } },
        });
        if (currentBrick === undefined) return;
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
        yield* operations.updateBrick({
          resourceId: payload.brickId,
          attributes: {
            state: structuredClone(decodedState),
            stateRevision: currentBrick.stateRevision + 1,
          },
        });
        for (const breakpoint of breakpoints) {
          const currentPlacement = yield* findFirst({
            db,
            model: placement,
            where: { id: { eq: makePlacementId(payload.brickId, breakpoint) } },
          });
          if (currentPlacement === undefined) continue;
          yield* operations.updatePlacement({
            resourceId: makePlacementId(payload.brickId, breakpoint),
            attributes: {
              generation:
                currentPlacement.generation?.status === "generating"
                  ? { ...currentPlacement.generation, status: "superseded" }
                  : currentPlacement.generation,
            },
          });
        }
      });
    },
  });
}
