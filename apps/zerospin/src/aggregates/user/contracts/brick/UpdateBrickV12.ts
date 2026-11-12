import { candidateLibrary } from "@qrk.sh/bricks/modules/candidateLibrary";
import { mapParseError } from "@zerospin/error";
import { DownAdapterRefused, findFirst, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect, Result, Schema } from "effect";
import { makePlacementId } from "../../layout/makePlacementId";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateBrickV11 } from "./UpdateBrickV11";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];

export const updateBrickV12 = upgradeAggregateContractRelease(updateBrickV11, {
  version: 12,
  payload: {},
  operations: { updateBrick: brick.operations.update, updatePlacement: placement.operations.update },
  guard: Effect.fn("updateBrickV12.guard")(function* (props) {
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

    const candidate = candidateLibrary[brickRow.moduleId];
    const state = Schema.decodeUnknownResult(candidate.completeStateSchema)(payload.state, {
      onExcessProperty: "ignore",
    });
    if (Result.isFailure(state))
      return yield* failures.invalidState.make({
        message: `Brick state is invalid for module ${brickRow.moduleId}.`,
        status: 400,
      });

    for (const breakpoint of ["sm", "md", "lg", "xl"] satisfies Array<"sm" | "md" | "lg" | "xl">) {
      const placementId = makePlacementId(payload.brickId, breakpoint);
      const placementRow = yield* findFirst({
        db: db,
        model: db.models.placement,
        where: { id: { eq: placementId } },
      });
      if (placementRow === undefined) continue;
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
  down: Effect.fn("updateBrickV12.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "image") return DownAdapterRefused;
    return payload;
  }),
  program: Effect.fn("updateBrickV12.program")(function* (props) {
    const { operations, payload, db } = props;
    const currentBrick = yield* findFirst({
      db,
      model: db.models.brick,
      where: { id: { eq: payload.brickId } },
    });
    if (currentBrick === undefined) return;
    const candidate = candidateLibrary[payload.moduleId];
    const decodedState = yield* Schema.decodeUnknownEffect(candidate.completeStateSchema)(
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
  }),
});
