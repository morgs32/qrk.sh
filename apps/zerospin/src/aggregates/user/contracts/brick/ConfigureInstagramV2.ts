import { findFirst } from "@zerospin/core/contracts/findFirst";
import { Effect, Schema } from "effect";
import { makePlacementId } from "@qrk.sh/library/makePlacementId";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { makeEffectSchema } from "@zerospin/shapes";
import { instagramV1 } from "@qrk.sh/library/modules/instagram/instagramV1";
import { normalizeInstagramInput } from "@qrk.sh/library/modules/instagram/normalizeInstagramInput";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureInstagram } from "./ConfigureInstagramV1";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
const State = Schema.toType(makeEffectSchema(instagramV1.stateShape));

export const configureInstagramV2 = upgradeAggregateContractVersion(configureInstagram, {
  version: "2.0.0",
  up: Effect.fn("configureInstagram.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  payload: {},
  models: { brick, placement },
  operations: {
    updateBrick: brick.operations.update,
    updatePlacement: placement.operations.update,
  },
  guard: Effect.fn("configureInstagram.guard")(function* (props) {
    const { db, payload, failures } = props;
    const input = normalizeInstagramInput(payload.url);
    if (input === undefined || payload.requestId.trim().length === 0)
      return yield* failures.invalidInput.make({
        message: "Enter a valid instagram input",
        status: 400,
      });
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
    if (row === undefined || row.moduleId !== "instagram")
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
  program: Effect.fn("configureInstagram.program")(function* (props) {
    const { db, payload, operations } = props;
    const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
    if (row === undefined) return;
    yield* operations.updateBrick({
      resourceId: row.id,
      attributes: {
        stateRevision: row.stateRevision + 1,
        state: {
          payload: { url: normalizeInstagramInput(payload.url) },
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
