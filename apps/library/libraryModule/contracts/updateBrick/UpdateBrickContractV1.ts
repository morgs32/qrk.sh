import { ContractError } from "@zerospin/error";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import type { IOperation } from "@zerospin/core/contracts/types";
import { makeUpdateOperation } from "@zerospin/core/contracts/make/makeUpdateOperation";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { mapParseError, ZerospinError } from "@zerospin/error";
import { makeEffectSchema, primitives, type IShape } from "@zerospin/shapes";
import { Channel, Effect, Schema } from "effect";

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

  return makeAggregateContractVersion(updateBrick, {
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
      const { payload } = props;
      return Channel.unwrap(
        Effect.gen(function* () {
          const operations: Channel.Channel<
            IOperation<typeof brick | typeof placement>,
            ZerospinError,
            void
          >[] = [];

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
          operations.push(
            makeUpdateOperation({
              model: brick,
              resourceId: payload.brickId,
              attributes: {
                state: structuredClone(decodedState),
              },
            }),
          );
          for (const breakpoint of breakpoints) {
            operations.push(
              makeUpdateOperation({
                model: placement,
                resourceId: makePlacementId(payload.brickId, breakpoint),
                attributes: {
                  measured:
                    payload.measurements === null
                      ? null
                      : structuredClone(payload.measurements[breakpoint]),
                },
              }),
            );
          }

          return Channel.fromIterable(operations).pipe(Channel.flatMap((operation) => operation));
        }),
      );
    },
  });
}
