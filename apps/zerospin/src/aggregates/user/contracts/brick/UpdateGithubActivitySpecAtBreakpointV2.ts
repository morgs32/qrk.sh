import { backendLibrary } from "@qrk.sh/library/backendLibrary";
import { makeModuleSpecDocumentSchema } from "@qrk.sh/library/makeModuleSpecDocumentSchema";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { primitives } from "@zerospin/shapes";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { ZerospinError, mapParseError } from "@zerospin/error";
import { Effect, Schema } from "effect";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateGithubActivitySpecAtBreakpoint } from "./UpdateGithubActivitySpecAtBreakpointV1";

const SpecDocumentSchema = makeModuleSpecDocumentSchema(backendLibrary["github-activity"].components, true);

export const updateGithubActivitySpecAtBreakpointV2 = upgradeAggregateContractVersion(updateGithubActivitySpecAtBreakpoint, {
  version: "2.0.0",
  up: Effect.fn("updateGithubActivitySpecAtBreakpoint.up")(function* (props) {
    const { payload } = props;
    const spec = yield* Schema.decodeUnknownEffect(SpecDocumentSchema)(payload.spec).pipe(
      mapParseError({
        code: "update-github-activity-spec-invalid-history",
        prefix: "Stored spec does not satisfy the new spec schema",
      }),
    );
    return { ...payload, spec };
  }),
  operations: { updatePlacement: placement.operations.update },
  models: { brick, placement },
  payload: { spec: primitives.json({ schema: SpecDocumentSchema }) },
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
});
