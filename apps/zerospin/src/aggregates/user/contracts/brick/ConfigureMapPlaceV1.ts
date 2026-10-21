import { brick as brickIdentity } from "../../models/brick/brick";
import { modelId } from "@zerospin/sdk/browser";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ContractError } from "@zerospin/error";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";
import { makePlacementId } from "../../../../modules/lib/makePlacementId";
import { mapPlaceV1 } from "../../../../modules/mapPlace/mapPlaceV1";
import { normalizeMapPlaceInput } from "../../../../modules/mapPlace/normalizeMapPlaceInput";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
const State = Schema.toType(makeEffectSchema(mapPlaceV1.stateShape));

export const configureMapPlace = makeAggregateContractVersion(defineAggregateContract("configureMapPlace"), {
  version: "1.0.0",
  models: { brick, placement },
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  payload: {
    brickId: modelId({ model: brickIdentity }),
    requestId: primitives.text(),
    googlePlaceId: primitives.text(),
  },
  failures: {
    invalidInput: ContractError.schema({ code: "configure-map-place-invalid-input" }),
    invalidBrick: ContractError.schema({ code: "configure-map-place-invalid-brick" }),
    alreadyResolving: ContractError.schema({ code: "configure-map-place-already-resolving" }),
  },
  guard: Effect.fn("configureMapPlace.guard")(function* (props) {
    const { db, payload, failures } = props;
    const input = normalizeMapPlaceInput(payload.googlePlaceId);
    if (input === undefined || payload.requestId.trim().length === 0)
      return yield* failures.invalidInput.make({
        message: "Enter a valid map-place input",
        status: 400,
      });
    const row = yield* findFirst({ db, model: db.models.brick, where: { id: { eq: payload.brickId } } });
    if (row === undefined || row.moduleId !== "map-place")
      return yield* failures.invalidBrick.make({
        message: "The brick is unavailable for this module",
        status: 404,
      });
    const current = Schema.decodeUnknownResult(State)(row.state);
    if (
      current._tag === "Success" &&
      current.success.resolution.status === "resolving" &&
      current.success.payload.googlePlaceId === input
    )
      return yield* failures.alreadyResolving.make({
        message: "This input is already resolving",
        status: 409,
      });
  }),
  program: Effect.fn("configureMapPlace.program")(function* (props) {
    const { db, payload, operations } = props;
    const row = yield* findFirst({ db, model: db.models.brick, where: { id: { eq: payload.brickId } } });
    if (row === undefined) return;
    yield* operations.updateBrick({
      resourceId: row.id,
      attributes: {
        stateRevision: row.stateRevision + 1,
        state: {
          payload: { googlePlaceId: normalizeMapPlaceInput(payload.googlePlaceId) },
          data: null,
          resolution: { requestId: payload.requestId, status: "resolving", error: null },
        },
      },
    });
    for (const breakpoint of breakpoints) {
      const currentPlacement = yield* findFirst({
        db,
        model: db.models.placement,
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
