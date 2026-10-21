import { brick as brickIdentity } from "../../models/brick/brick";
import { backendLibraryV1 as library } from "../../../../modules/backendLibraryV1";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { rowV1 as row } from "../../models/row/RowV1";
import { stackV1 as stack } from "../../models/stack/StackV1";
import { sectionV1 as section } from "../../models/section/SectionV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { ContractError } from "@zerospin/error";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { modelId, makeAggregateContractVersion, defineAggregateContract } from "@zerospin/sdk/browser";
import { mapParseError } from "@zerospin/error";
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

export const updateBrick = makeAggregateContractVersion(defineAggregateContract("updateBrick"), {
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
    row,
    stack,
    section,
    wall,
  },
  version: "1.0.0",
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
    yield* Schema.decodeUnknownEffect(Schema.NullOr(StateSchema))(payload.state, {
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
      const rowEntry = yield* findFirst({
        db,
        model: db.models.row,
        where: { id: { eq: placementRow.rowId } },
      });
      const stackEntry =
        rowEntry === undefined
          ? undefined
          : yield* findFirst({ db, model: db.models.stack, where: { id: { eq: rowEntry.stackId } } });
      const sectionEntry =
        stackEntry === undefined
          ? undefined
          : yield* findFirst({ db, model: db.models.section, where: { id: { eq: stackEntry.sectionId } } });
      const wallEntry =
        sectionEntry === undefined
          ? undefined
          : yield* findFirst({ db, model: db.models.wall, where: { id: { eq: sectionEntry.wallId } } });
      if (
        placementRow.brickId !== payload.brickId ||
        wallEntry?.breakpoint !== breakpoint ||
        wallEntry.pageId !== brickRow.pageId
      ) {
        return yield* failures.updateBrickPlacementMismatch.make({
          message: `placement ${placementId} does not belong to brick ${payload.brickId} at ${breakpoint}`,
          status: 400,
        });
      }
    }
  }),
  program: (props) => {
    const { operations, payload, db } = props;
    return Effect.gen(function* () {
      const currentBrick = yield* findFirst({
        db,
        model: db.models.brick,
        where: { id: { eq: payload.brickId } },
      });
      if (currentBrick === undefined) return;
      const brickModule = library[payload.moduleId];
      const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
      const decodedState = yield* Schema.decodeUnknownEffect(Schema.NullOr(StateSchema))(
        payload.state,
        { onExcessProperty: "ignore" },
      ).pipe(
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
    });
  },
});
