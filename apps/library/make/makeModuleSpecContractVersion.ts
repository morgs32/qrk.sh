import { findFirst } from "@zerospin/core/contracts/findFirst";
import { makeUpdateOperation } from "@zerospin/core/contracts/make/makeUpdateOperation";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ZerospinError } from "@zerospin/error";
import { primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import { makeBrickModel } from "../libraryModule/models/brick/makeBrickModel";
import { makePlacementId } from "../libraryModule/models/placement/makePlacementId";
import { makePlacementModel } from "../libraryModule/models/placement/placementModelV1";
import type { defineComponent } from "./defineComponent";
import { makeModuleSpecDocumentSchema } from "./makeModuleSpecDocumentSchema";

/** Per-module contract that updates one placement Spec at a breakpoint. */
export function makeModuleSpecContractVersion<
  const COMMAND_NAME extends string,
  const MODULE_ID extends string,
>(props: {
  commandName: COMMAND_NAME;
  moduleId: MODULE_ID;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
  components: Record<string, ReturnType<typeof defineComponent>>;
}) {
  const { commandName, moduleId, brick, placement, components } = props;
  const command = defineAggregateContract(commandName);
  const SpecDocumentSchema = makeModuleSpecDocumentSchema(components);

  const payload = {
    brickId: primitives.foreignKey({
      abbreviation: brick.abbreviation,
    }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    spec: primitives.json({ schema: SpecDocumentSchema }),
  };

  return makeAggregateContractVersion(command, {
    operations: Schema.Array(placement.operations.update),
    payload,
    models: {
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn(`${commandName}.guard`)(function* (props) {
      const { db, payload: guardPayload } = props;

      const brickRow = yield* findFirst({
        db: db,
        model: brick,
        where: { id: { eq: guardPayload.brickId } },
      });

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: `update-${moduleId}-spec-brick-not-found`,
          message: `brick ${guardPayload.brickId} was not found`,
          status: 404,
        });
      }

      if (brickRow.moduleId !== moduleId) {
        return yield* new ZerospinError({
          code: `update-${moduleId}-spec-module-mismatch`,
          message: `brick ${guardPayload.brickId} belongs to module ${brickRow.moduleId}, not ${moduleId}`,
          status: 400,
        });
      }

      const expectedPlacementId = makePlacementId(guardPayload.brickId, guardPayload.breakpoint);
      const placementRow = yield* findFirst({
        db: db,
        model: placement,
        where: { id: { eq: expectedPlacementId } },
      });

      if (placementRow === undefined) {
        return yield* new ZerospinError({
          code: `update-${moduleId}-spec-placement-not-found`,
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }
    }),
    program: (props) => {
      const { payload: programPayload } = props;
      return Effect.gen(function* () {
        const operation = yield* makeUpdateOperation({
          model: placement,
          resourceId: makePlacementId(programPayload.brickId, programPayload.breakpoint),
          attributes: { spec: structuredClone(programPayload.spec), measured: null },
        });
        return { operations: [operation], result: undefined };
      });
    },
  });
}
