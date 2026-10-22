import { brick as brickIdentity } from "../../models/brick/brick";

import { modelId } from "@zerospin/sdk/browser";

import { backendLibrary as library } from "../../../../modules/backendLibrary";

import { brickV1 as brick } from "../../models/brick/BrickV1";

import { placementV1 as placement } from "../../models/placement/PlacementV1";

import { wallV1 as wall } from "../../models/wall/WallV1";

import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";

import { findFirst } from "@zerospin/core/contracts/findFirst";

import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";

import { ContractError } from "@zerospin/error";

import { primitives } from "@zerospin/shapes";

import { Effect } from "effect";

import { makePlacementId } from "../../../../modules/lib/makePlacementId";

export const generateBrickSpecV1 = makeAggregateContractVersion(
  defineAggregateContract("generateBrickSpec"),
  {
    version: 1,
    models: {
      brick,
      placement,
      wall,
    },
    operations: {
      updatePlacement: placement.operations.update,
    },
    payload: {
      brickId: modelId({ model: brickIdentity }),
      breakpoint: wall.attributes.breakpoint,
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
        model: db.models.brick,
        where: { id: { eq: payload.brickId } },
      });
      const placementRow = yield* findFirst({
        db,
        model: db.models.placement,
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
      const wallEntry = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: placementRow.wallId } },
      });
      if (
        placementRow.brickId !== brickRow.id ||
        wallEntry === undefined ||
        wallEntry.breakpoint !== payload.breakpoint ||
        wallEntry.pageId !== brickRow.pageId ||
        !wallEntry.layout.sections.some((section) =>
          section.stacks.some((stack) =>
            stack.rows.some((row) => row.placementIds.includes(placementRow.id)),
          ),
        )
      )
        return yield* failures.unavailable.make({
          message: "The placement is not in this Page's breakpoint Wall",
          status: 409,
        });
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
  },
);
