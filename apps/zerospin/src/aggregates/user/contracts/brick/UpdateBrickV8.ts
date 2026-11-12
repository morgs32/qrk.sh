import { findFirst, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { makeEffectSchema } from "@zerospin/shapes";
import { Effect, Result, Schema } from "effect";
import { makePlacementId } from "../../layout/makePlacementId";
import { updateBrickV7 } from "./UpdateBrickV7";

export const updateBrickV8 = upgradeAggregateContractRelease(updateBrickV7, {
  version: 8,
  payload: {},
  guard: Effect.fn("updateBrickV8.guard")(function* (props) {
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

    const brickModule = backendLibrary[brickRow.moduleId];
    const StateSchema = Schema.toType(makeEffectSchema(brickModule.stateShape));
    const state = Schema.decodeUnknownResult(
      brickModule.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
    )(payload.state, { onExcessProperty: "ignore" });
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
  down: Effect.fn("updateBrickV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
