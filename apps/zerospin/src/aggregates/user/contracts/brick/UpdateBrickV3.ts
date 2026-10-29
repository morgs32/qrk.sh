import { brick as brickIdentity } from "../../models/brick/brick";

import { backendLibrary as library } from "../../../../modules/backendLibrary";

import { brickV2 as brick } from "../../models/brick/BrickV2";

import { placementV1 as placement } from "../../models/placement/PlacementV1";

import { wallV1 as wall } from "../../models/wall/WallV1";

import { ContractError, mapParseError } from "@zerospin/error";

import { findFirst } from "@zerospin/core/contracts/findFirst";

import {
  modelId,
  makeAggregateContractRelease,
  defineAggregateContract,
} from "@zerospin/sdk/browser";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import { Effect, Schema } from "effect";

import { makePlacementId } from "../../../../modules/lib/makePlacementId";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];

const updateBrickPayload = {
  brickId: modelId({
    model: brickIdentity,
  }),
  moduleId: brick.attributes.moduleId,
  state: primitives.json({ schema: Schema.Unknown }),
};

export const updateBrickV3 = makeAggregateContractRelease(defineAggregateContract("updateBrick"), {
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
    wall,
  },
  version: 3,
  guard: Effect.fn("updateBrick.guard")(function* (props) {
    const { failures, db, payload } = props;
    const brickRow = yield* findFirst({
      db: db,
      model: db.models.brick,
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
    )(payload.state, {
      onExcessProperty: "ignore",
    }).pipe(
      mapParseError({
        code: "update-brick-invalid-state",
        prefix: `updateBrick state failed ${brickRow.moduleId} decode`,
      }),
    );

    for (const breakpoint of breakpoints) {
      const placementId = makePlacementId(payload.brickId, breakpoint);
      const placementRow = yield* findFirst({
        db: db,
        model: db.models.placement,
        where: { id: { eq: placementId } },
      });
      if (placementRow === undefined) {
        return yield* failures.updateBrickPlacementNotFound.make({
          message: `placement ${placementId} was not found`,
          status: 404,
        });
      }
      const wallEntry = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: placementRow.wallId } },
      });
      if (
        placementRow.brickId !== payload.brickId ||
        wallEntry === undefined ||
        wallEntry.breakpoint !== breakpoint ||
        wallEntry.pageId !== brickRow.pageId ||
        !wallEntry.layout.sections.some((section) =>
          section.stacks.some((stack) =>
            stack.rows.some((row) => row.placementIds.includes(placementId)),
          ),
        )
      ) {
        return yield* failures.updateBrickPlacementMismatch.make({
          message: `placement ${placementId} does not belong to brick ${payload.brickId} at ${breakpoint}`,
          status: 400,
        });
      }
    }
  }),
  program: Effect.fn("updateBrick.program")(function* (props) {
    const { operations, payload, db } = props;
    const currentBrick = yield* findFirst({
      db,
      model: db.models.brick,
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
        model: db.models.placement,
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
  }),
});
