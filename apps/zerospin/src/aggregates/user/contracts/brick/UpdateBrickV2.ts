import { backendLibrary as library } from "@qrk.sh/library/backendLibrary";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { rowV1 as row } from "../../models/row/RowV1";
import { stackV1 as stack } from "../../models/stack/StackV1";
import { sectionV1 as section } from "../../models/section/SectionV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { updateBrick as previous } from "./UpdateBrickV1";
import { mapParseError } from "@zerospin/error";
import { makeEffectSchema } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import { makePlacementId } from "@qrk.sh/library/makePlacementId";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];

export const updateBrickV2 = upgradeAggregateContractVersion(previous, {
  up: Effect.fn("updateBrickV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  payload: {},
  models: {
    brick,
    placement,
    row,
    stack,
    section,
    wall,
  },
  version: "2.0.0",
  guard: Effect.fn("updateBrick.guard")(function* (props) {
    const { failures, db, payload } = props;
    const brickRow = yield* findFirst({
      db: db,
      model: brick,
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
        model: placement,
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
        model: row,
        where: { id: { eq: placementRow.rowId } },
      });
      const stackEntry =
        rowEntry === undefined
          ? undefined
          : yield* findFirst({ db, model: stack, where: { id: { eq: rowEntry.stackId } } });
      const sectionEntry =
        stackEntry === undefined
          ? undefined
          : yield* findFirst({ db, model: section, where: { id: { eq: stackEntry.sectionId } } });
      const wallEntry =
        sectionEntry === undefined
          ? undefined
          : yield* findFirst({ db, model: wall, where: { id: { eq: sectionEntry.wallId } } });
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
        model: brick,
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
          model: placement,
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
