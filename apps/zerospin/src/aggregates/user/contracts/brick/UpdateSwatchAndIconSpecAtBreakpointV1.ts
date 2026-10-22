import { brick as brickIdentity } from "../../models/brick/brick";

import { modelId } from "@zerospin/sdk/browser";

import { backendLibrary } from "../../../../modules/backendLibrary";

import { makeModuleSpecDocumentSchema } from "../../../../modules/make/makeModuleSpecDocumentSchema";

import { makePlacementId } from "../../../../modules/lib/makePlacementId";

import { findFirst } from "@zerospin/core/contracts/findFirst";

import { primitives } from "@zerospin/shapes";

import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";

import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";

import { ZerospinError } from "@zerospin/error";

import { Effect } from "effect";

import { brickV1 as brick } from "../../models/brick/BrickV1";

import { placementV1 as placement } from "../../models/placement/PlacementV1";

import { wallV1 as wall } from "../../models/wall/WallV1";

const SpecDocumentSchema = makeModuleSpecDocumentSchema(
  backendLibrary["swatch-and-icon"].components,
);

export const updateSwatchAndIconSpecAtBreakpointV1 = makeAggregateContractVersion(
  defineAggregateContract("updateSwatchAndIconSpecAtBreakpoint"),
  {
    version: 1,
    operations: {
      updatePlacement: placement.operations.update,
    },
    models: {
      brick,
      placement,
      wall,
    },
    payload: {
      brickId: modelId({ model: brickIdentity }),
      breakpoint: primitives.enum({ values: ["sm", "md", "lg", "xl"] }),
      spec: primitives.json({ schema: SpecDocumentSchema }),
    },
    guard: Effect.fn("updateSwatchAndIconSpecAtBreakpoint.guard")(function* (props) {
      const { db, payload: guardPayload } = props;

      const brickRow = yield* findFirst({
        db: db,
        model: db.models.brick,
        where: { id: { eq: guardPayload.brickId } },
      });

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: "update-swatch-and-icon-spec-brick-not-found",
          message: `brick ${guardPayload.brickId} was not found`,
          status: 404,
        });
      }

      if (brickRow.moduleId !== "swatch-and-icon") {
        return yield* new ZerospinError({
          code: "update-swatch-and-icon-spec-module-mismatch",
          message: `brick ${guardPayload.brickId} belongs to module ${brickRow.moduleId}, not swatch-and-icon`,
          status: 400,
        });
      }

      const expectedPlacementId = makePlacementId(guardPayload.brickId, guardPayload.breakpoint);
      const placementRow = yield* findFirst({
        db: db,
        model: db.models.placement,
        where: { id: { eq: expectedPlacementId } },
      });

      if (placementRow === undefined) {
        return yield* new ZerospinError({
          code: "update-swatch-and-icon-spec-placement-not-found",
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }
      const wallRow = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: placementRow.wallId } },
      });
      if (
        placementRow.brickId !== brickRow.id ||
        wallRow === undefined ||
        wallRow.pageId !== brickRow.pageId ||
        wallRow.breakpoint !== guardPayload.breakpoint ||
        !wallRow.layout.sections.some((section) =>
          section.stacks.some((stack) =>
            stack.rows.some((row) => row.placementIds.includes(placementRow.id)),
          ),
        )
      ) {
        return yield* new ZerospinError({
          code: "update-swatch-and-icon-spec-placement-mismatch",
          message: `placement ${expectedPlacementId} does not belong to this Page's breakpoint Wall`,
          status: 400,
        });
      }
    }),
    program: (props) => {
      const { operations, payload: programPayload, db } = props;
      return Effect.gen(function* () {
        const currentPlacement = yield* findFirst({
          db,
          model: db.models.placement,
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
