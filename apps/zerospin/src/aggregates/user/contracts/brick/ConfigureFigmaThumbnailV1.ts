import { brick as brickIdentity } from "../../models/brick/brick";
import { modelId } from "@zerospin/sdk/browser";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { Effect, Schema } from "effect";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ContractError } from "@zerospin/error";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { figmaThumbnailV1 } from "@qrk.sh/library/modules/figmaThumbnail/figmaThumbnailV1";
import { normalizeFigmaThumbnailInput } from "@qrk.sh/library/modules/figmaThumbnail/normalizeFigmaThumbnailInput";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
const State = Schema.toType(makeEffectSchema(figmaThumbnailV1.stateShape));

export const configureFigmaThumbnail = makeAggregateContractVersion(defineAggregateContract("configureFigmaThumbnail"), {
  version: "1.0.0",
  models: { brick, placement },
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  payload: {
    brickId: modelId({ model: brickIdentity }),
    requestId: primitives.text(),
    url: primitives.text(),
  },
  failures: {
    invalidInput: ContractError.schema({ code: "configure-figma-thumbnail-invalid-input" }),
    invalidBrick: ContractError.schema({ code: "configure-figma-thumbnail-invalid-brick" }),
    alreadyResolving: ContractError.schema({
      code: "configure-figma-thumbnail-already-resolving",
    }),
  },
  guard: Effect.fn("configureFigmaThumbnail.guard")(function* (props) {
    const { db, payload, failures } = props;
    const input = normalizeFigmaThumbnailInput(payload.url);
    if (input === undefined || payload.requestId.trim().length === 0)
      return yield* failures.invalidInput.make({
        message: "Enter a valid figma-thumbnail input",
        status: 400,
      });
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
    if (row === undefined || row.moduleId !== "figma-thumbnail")
      return yield* failures.invalidBrick.make({
        message: "The brick is unavailable for this module",
        status: 404,
      });
    const current = Schema.decodeUnknownResult(State)(row.state);
    if (
      current._tag === "Success" &&
      current.success.resolution.status === "resolving" &&
      current.success.payload.url === input
    )
      return yield* failures.alreadyResolving.make({
        message: "This input is already resolving",
        status: 409,
      });
  }),
  program: Effect.fn("configureFigmaThumbnail.program")(function* (props) {
    const { db, payload, operations } = props;
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
    if (row === undefined) return;
    yield* operations.updateBrick({
      resourceId: row.id,
      attributes: {
        stateRevision: row.stateRevision + 1,
        state: {
          payload: { url: normalizeFigmaThumbnailInput(payload.url) },
          data: null,
          resolution: { requestId: payload.requestId, status: "resolving", error: null },
        },
      },
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
