import { findFirst } from "@zerospin/core/contracts/findFirst";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ContractError } from "@zerospin/error";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";
import type { makeBrickModel } from "../../libraryModule/models/brick/makeBrickModel";
import type { makePlacementModel } from "../../libraryModule/models/placement/placementModelV1";
import { makePlacementId } from "../../libraryModule/models/placement/makePlacementId";
import { githubRepoV1 } from "./githubRepoV1";
import { normalizeGithubRepoInput } from "./normalizeGithubRepoInput";

export function makeConfigureGithubRepoContract(props: {
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { brick, placement } = props;
  const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
  const State = Schema.toType(makeEffectSchema(githubRepoV1.stateShape));
  return makeAggregateContractVersion(defineAggregateContract("configureGithubRepo"), {
    version: "1.0.0",
    models: { brick, placement },
    operations: {
      updateBrick: brick.operations.update,
      updatePlacement: placement.operations.update,
    },
    payload: {
      brickId: primitives.foreignKey({ abbreviation: brick.abbreviation }),
      requestId: primitives.text(),
      url: primitives.text(),
    },
    failures: {
      invalidInput: ContractError.schema({ code: "configure-github-repo-invalid-input" }),
      invalidBrick: ContractError.schema({ code: "configure-github-repo-invalid-brick" }),
      alreadyResolving: ContractError.schema({ code: "configure-github-repo-already-resolving" }),
    },
    guard: Effect.fn("configureGithubRepo.guard")(function* (props) {
      const { db, payload, failures } = props;
      const input = normalizeGithubRepoInput(payload.url);
      if (input === undefined || payload.requestId.trim().length === 0)
        return yield* failures.invalidInput.make({
          message: "Enter a valid github-repo input",
          status: 400,
        });
      const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
      if (row === undefined || row.moduleId !== "github-repo")
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
    program: Effect.fn("configureGithubRepo.program")(function* (props) {
      const { db, payload, operations } = props;
      const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
      if (row === undefined) return;
      yield* operations.updateBrick({
        resourceId: row.id,
        attributes: {
          stateRevision: row.stateRevision + 1,
          state: {
            payload: { url: normalizeGithubRepoInput(payload.url) },
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
              measured: null,
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
