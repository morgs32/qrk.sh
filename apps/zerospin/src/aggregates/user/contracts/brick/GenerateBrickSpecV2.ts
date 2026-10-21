import { backendLibrary as library } from "../../../../modules/backendLibrary";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import {
  generateBrickSpec as previousGenerate,
  completeBrickSpecGeneration as previousComplete,
} from "./GenerateBrickSpecV1";
import { Effect, Schema } from "effect";

import { makeModuleSpecDocumentSchema } from "../../../../modules/make/makeModuleSpecDocumentSchema";
import { makePlacementId } from "../../../../modules/lib/makePlacementId";

export const generateBrickSpecV2 = upgradeAggregateContractVersion(
  previousGenerate,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
export const completeBrickSpecGenerationV2 = upgradeAggregateContractVersion(
  previousComplete,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
    program: Effect.fn("completeBrickSpecGeneration.program")(function* (props) {
      const { db, payload, operations } = props;
      const brickRow = yield* findFirst({
        db,
        model: db.models.brick,
        where: { id: { eq: payload.brickId } },
      });
      const placementRow = yield* findFirst({
        db,
        model: db.models.placement,
        where: { id: { eq: makePlacementId(payload.brickId, payload.breakpoint) } },
      });
      const generation = placementRow?.generation;
      if (
        brickRow === undefined ||
        placementRow === undefined ||
        generation?.status !== "generating" ||
        brickRow.moduleId !== payload.moduleId ||
        brickRow.stateRevision !== payload.baseStateRevision ||
        placementRow.specRevision !== payload.baseSpecRevision ||
        generation.requestId !== payload.requestId ||
        generation.baseStateRevision !== payload.baseStateRevision ||
        generation.baseSpecRevision !== payload.baseSpecRevision
      )
        return;
      if (payload.outcome.status === "failed") {
        yield* operations.updatePlacement({
          resourceId: placementRow.id,
          attributes: {
            generation: { ...generation, status: "failed", error: payload.outcome.error },
          },
        });
        return;
      }
      const decoded = Schema.decodeUnknownResult(
        makeModuleSpecDocumentSchema(library[brickRow.moduleId].components, true),
      )(payload.outcome.spec);
      if (decoded._tag === "Failure") {
        yield* operations.updatePlacement({
          resourceId: placementRow.id,
          attributes: {
            generation: {
              ...generation,
              status: "failed",
              error: {
                code: "generated-spec-invalid",
                message: "The generated spec did not match this module. Try again.",
                retryable: true,
              },
            },
          },
        });
        return;
      }
      yield* operations.updatePlacement({
        resourceId: placementRow.id,
        attributes: {
          spec: structuredClone(decoded.success),
          specRevision: placementRow.specRevision + 1,
          generation: { ...generation, status: "ready", error: null },
        },
      });
    }),
  },
);
