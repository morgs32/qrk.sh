import { findFirst } from "@zerospin/core/contracts/findFirst";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ContractError } from "@zerospin/error";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";
import type { makeBrickModel } from "../../make/makeBrickModel";
import type { makePlacementModel } from "../../make/makePlacementModel";
import { makePlacementId } from "../../lib/makePlacementId";
import { linkV1 } from "./linkV1";
import { normalizeLinkInput } from "./normalizeLinkInput";

export function makeCompleteLinkContract(props: {
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { brick, placement } = props;
  const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
  const State = Schema.toType(makeEffectSchema(linkV1.stateShape));
  return makeAggregateContractVersion(defineAggregateContract("completeLink"), {
    version: "1.0.0",
    models: { brick, placement },
    operations: {
      updateBrick: brick.operations.update,
      updatePlacement: placement.operations.update,
    },
    payload: {
      brickId: primitives.foreignKey({ abbreviation: brick.abbreviation }),
      requestId: primitives.text(),
      baseStateRevision: primitives.integer(),
      state: primitives.json({ schema: State }),
    },
    failures: { invalidCompletion: ContractError.schema({ code: "complete-link-invalid-state" }) },
    guard: Effect.fn("completeLink.guard")(function* (props) {
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
    program: Effect.fn("completeLink.program")(function* (props) {
      const { db, payload, operations } = props;
      const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
      if (
        row === undefined ||
        row.moduleId !== "link" ||
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
}
