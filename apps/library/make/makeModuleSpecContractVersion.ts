import { findFirst } from "@zerospin/core/contracts/findFirst";

import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ZerospinError } from "@zerospin/error";
import { primitives } from "@zerospin/shapes";
import { Effect } from "effect";

import { makeBrickModel } from "./makeBrickModel";
import { makePlacementId } from "../lib/makePlacementId";
import { makePlacementModel } from "./makePlacementModel";
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
    operations: { updatePlacement: placement.operations.update },
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
      const { operations, payload: programPayload, db } = props;
      return Effect.gen(function* () {
        const currentPlacement = yield* findFirst({
          db,
          model: placement,
          where: { id: { eq: makePlacementId(programPayload.brickId, programPayload.breakpoint) } },
        });
        if (currentPlacement === undefined) return;
        yield* operations.updatePlacement({
          resourceId: makePlacementId(programPayload.brickId, programPayload.breakpoint),
          attributes: {
            spec: structuredClone(programPayload.spec),
            specRevision: currentPlacement.specRevision + 1,
            generation:
              currentPlacement.generation?.status === "generating"
                ? { ...currentPlacement.generation, status: "superseded" }
                : currentPlacement.generation,
          },
        });
      });
    },
  });
}
