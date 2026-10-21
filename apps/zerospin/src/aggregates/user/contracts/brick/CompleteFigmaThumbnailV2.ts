import { findFirst } from "@zerospin/core/contracts/findFirst";
import { Effect, Schema } from "effect";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { makeEffectSchema } from "@zerospin/shapes";
import { figmaThumbnailV1 } from "@qrk.sh/library/modules/figmaThumbnail/figmaThumbnailV1";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeFigmaThumbnail } from "./CompleteFigmaThumbnailV1";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
const State = Schema.toType(makeEffectSchema(figmaThumbnailV1.stateShape));

export const completeFigmaThumbnailV2 = upgradeAggregateContractVersion(completeFigmaThumbnail, {
  version: "2.0.0",
  up: Effect.fn("completeFigmaThumbnail.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  payload: {},
  models: { brick, placement },
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  guard: Effect.fn("completeFigmaThumbnail.guard")(function* (props) {
    const { payload, failures } = props;
    if (
      payload.state.resolution.requestId !== payload.requestId ||
      payload.state.resolution.status === "resolving" ||
      (payload.state.resolution.status === "ready") !== (payload.state.data !== null) ||
      (payload.state.resolution.status === "failed") !== (payload.state.resolution.error !== null)
    )
      return yield* failures.invalidCompletion.make({
        message: "Invalid module resolution",
        status: 400,
      });
  }),
  program: Effect.fn("completeFigmaThumbnail.program")(function* (props) {
    const { db, payload, operations } = props;
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
    if (
      row === undefined ||
      row.moduleId !== "figma-thumbnail" ||
      row.stateRevision !== payload.baseStateRevision
    )
      return;
    const current = Schema.decodeUnknownResult(State)(row.state);
    if (
      current._tag === "Failure" ||
      current.success.resolution.status !== "resolving" ||
      current.success.resolution.requestId !== payload.requestId ||
      current.success.payload.url !== payload.state.payload.url
    )
      return;
    yield* operations.updateBrick({
      resourceId: row.id,
      attributes: { state: structuredClone(payload.state), stateRevision: row.stateRevision + 1 },
    });
    for (const breakpoint of breakpoints) {
      const currentPlacement = yield* findFirst({
        db,
        model: placement,
        where: { id: { eq: makePlacementId(row.id, breakpoint) } },
      });
      if (currentPlacement !== undefined)
        yield* operations.updatePlacement({
          resourceId: currentPlacement.id,
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
