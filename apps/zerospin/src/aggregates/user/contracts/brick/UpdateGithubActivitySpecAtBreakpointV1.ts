import { brick as brickIdentity } from "../../models/brick/brick";
import { modelId } from "@zerospin/sdk/browser";
import { backendLibrary } from "@qrk.sh/library/backendLibrary";
import { makeModuleSpecDocumentSchema } from "@qrk.sh/library/makeModuleSpecDocumentSchema";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { primitives } from "@zerospin/shapes";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ZerospinError } from "@zerospin/error";
import { Effect } from "effect";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";

const SpecDocumentSchema = makeModuleSpecDocumentSchema(backendLibrary["github-activity"].components);

export const updateGithubActivitySpecAtBreakpoint = makeAggregateContractVersion(
  defineAggregateContract("updateGithubActivitySpecAtBreakpoint"),
  {
    version: "1.0.0",
    operations: { updatePlacement: placement.operations.update },
    models: { brick, placement },
    payload: {
      brickId: modelId({ model: brickIdentity }),
      breakpoint: primitives.enum({ values: ["sm", "md", "lg", "xl"] }),
      spec: primitives.json({ schema: SpecDocumentSchema }),
    },
    guard: Effect.fn("updateGithubActivitySpecAtBreakpoint.guard")(function* (props) {
      const { db, payload: guardPayload } = props;

      const brickRow = yield* findFirst({
        db: db,
        model: brick,
        where: { id: { eq: guardPayload.brickId } },
      });

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: "update-github-activity-spec-brick-not-found",
          message: `brick ${guardPayload.brickId} was not found`,
          status: 404,
        });
      }

      if (brickRow.moduleId !== "github-activity") {
        return yield* new ZerospinError({
          code: "update-github-activity-spec-module-mismatch",
          message: `brick ${guardPayload.brickId} belongs to module ${brickRow.moduleId}, not github-activity`,
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
          code: "update-github-activity-spec-placement-not-found",
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
  },
);
