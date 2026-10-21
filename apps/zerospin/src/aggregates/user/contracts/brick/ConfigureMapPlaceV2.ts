import { findFirst } from "@zerospin/core/contracts/findFirst";
import { makeEffectSchema } from "@zerospin/shapes";
import { Effect, Schema } from "effect";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { mapPlaceV1 } from "@qrk.sh/library/modules/mapPlace/mapPlaceV1";
import { normalizeMapPlaceInput } from "@qrk.sh/library/modules/mapPlace/normalizeMapPlaceInput";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureMapPlace } from "./ConfigureMapPlaceV1";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
const State = Schema.toType(makeEffectSchema(mapPlaceV1.stateShape));

export const configureMapPlaceV2 = upgradeAggregateContractVersion(configureMapPlace, {
  version: "2.0.0",
  up: Effect.fn("configureMapPlaceV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { brick, placement },
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  payload: {},
  guard: Effect.fn("configureMapPlace.guard")(function* (props) {
    const { db, payload, failures } = props;
    const input = normalizeMapPlaceInput(payload.googlePlaceId);
    if (input === undefined || payload.requestId.trim().length === 0)
      return yield* failures.invalidInput.make({
        message: "Enter a valid map-place input",
        status: 400,
      });
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
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
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
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
