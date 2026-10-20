import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ContractError } from "@zerospin/error";
import { primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import type { IBackendLibrary } from "../../backendLibrary";
import { makeModuleSpecDocumentSchema } from "../../make/makeModuleSpecDocumentSchema";
import type { makeBrickModel } from "../models/brick/makeBrickModel";
import { makePlacementId } from "../models/placement/makePlacementId";
import type { makePlacementModel } from "../models/placement/placementModelV1";

export function makeBrickSpecGenerationContracts(props: {
  library: IBackendLibrary;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { library, brick, placement } = props;
  const generate = makeAggregateContractVersion(defineAggregateContract("generateBrickSpec"), {
    version: "1.0.0",
    models: { brick, placement },
    operations: { updatePlacement: placement.operations.update },
    payload: {
      brickId: primitives.foreignKey({ abbreviation: brick.abbreviation }),
      breakpoint: placement.attributes.breakpoint,
      requestId: primitives.text(),
      prompt: primitives.text(),
    },
    failures: {
      invalidPrompt: ContractError.schema({ code: "generate-brick-spec-invalid-prompt" }),
      unavailable: ContractError.schema({ code: "generate-brick-spec-unavailable" }),
    },
    program: Effect.fn("generateBrickSpec.program")(function* (props) {
      const { db, payload, operations, failures } = props;
      if (payload.prompt.trim().length === 0 || payload.requestId.trim().length === 0) {
        return yield* failures.invalidPrompt.make({
          message: "Enter a prompt to generate a spec",
          status: 400,
        });
      }
      const brickRow = yield* findFirst({
        db,
        model: brick,
        where: { id: { eq: payload.brickId } },
      });
      const placementRow = yield* findFirst({
        db,
        model: placement,
        where: { id: { eq: makePlacementId(payload.brickId, payload.breakpoint) } },
      });
      if (
        brickRow === undefined ||
        placementRow === undefined ||
        Object.keys(library[brickRow.moduleId].components).length === 0
      ) {
        return yield* failures.unavailable.make({
          message: "This placement does not support spec generation",
          status: 404,
        });
      }
      yield* operations.updatePlacement({
        resourceId: placementRow.id,
        attributes: {
          generation: {
            requestId: payload.requestId,
            prompt: payload.prompt.trim(),
            baseStateRevision: brickRow.stateRevision,
            baseSpecRevision: placementRow.specRevision,
            status: "generating",
            error: null,
          },
        },
      });
    }),
  });
  const complete = makeAggregateContractVersion(
    defineAggregateContract("completeBrickSpecGeneration"),
    {
      version: "1.0.0",
      models: { brick, placement },
      operations: { updatePlacement: placement.operations.update },
      payload: {
        brickId: primitives.foreignKey({ abbreviation: brick.abbreviation }),
        breakpoint: placement.attributes.breakpoint,
        moduleId: brick.attributes.moduleId,
        requestId: primitives.text(),
        baseStateRevision: primitives.integer(),
        baseSpecRevision: primitives.integer(),
        outcome: primitives.json({
          schema: Schema.Union([
            Schema.Struct({ status: Schema.Literal("ready"), spec: Schema.Unknown }),
            Schema.Struct({
              status: Schema.Literal("failed"),
              error: Schema.Struct({
                code: Schema.String,
                message: Schema.String,
                retryable: Schema.Boolean,
              }),
            }),
          ]),
        }),
      },
      program: Effect.fn("completeBrickSpecGeneration.program")(function* (props) {
        const { db, payload, operations } = props;
        const brickRow = yield* findFirst({
          db,
          model: brick,
          where: { id: { eq: payload.brickId } },
        });
        const placementRow = yield* findFirst({
          db,
          model: placement,
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
          makeModuleSpecDocumentSchema(library[brickRow.moduleId].components),
        )(payload.outcome.spec);
        if (
          decoded._tag === "Failure" ||
          !Object.hasOwn(decoded.success.elements, decoded.success.root)
        ) {
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
  return { generate, complete };
}
