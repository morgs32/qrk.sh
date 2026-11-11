import { backendLibrary } from "@qrk.sh/bricks/definition/backendLibrary";
import { imageStateSchema } from "@qrk.sh/bricks/image/definition/v2";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { mapParseError } from "@zerospin/error";
import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { makeEffectSchema } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import { makePlacementId } from "../../layout/makePlacementId";
import { brickV2 as brick } from "../../models/brick/BrickV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateBrickV5 } from "./UpdateBrickV5";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];

export const updateBrickV6 = upgradeAggregateContractRelease(updateBrickV5, {
  version: 6,
  payload: {},
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  program: Effect.fn("updateBrickV6.program")(function* (props) {
    const { operations, payload, db } = props;
    const currentBrick = yield* findFirst({
      db,
      model: db.models.brick,
      where: { id: { eq: payload.brickId } },
    });
    if (currentBrick === undefined) return;
    const brickModule = backendLibrary[payload.moduleId];
    const StateSchema =
      payload.moduleId === "image"
        ? imageStateSchema
        : Schema.toType(makeEffectSchema(brickModule.stateShape));
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
