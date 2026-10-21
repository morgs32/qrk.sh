import { brick as brickIdentity } from "../../models/brick/brick";
import { modelId } from "@zerospin/sdk/browser";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import { Effect, Schema } from "effect";
import { makePlacementId } from "../../../../modules/lib/makePlacementId";
import { githubRepoV1 } from "../../../../modules/githubRepo/githubRepoV1";
import { normalizeGithubRepoInput } from "../../../../modules/githubRepo/normalizeGithubRepoInput";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ContractError } from "@zerospin/error";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";

const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
const State = Schema.toType(makeEffectSchema(githubRepoV1.stateShape));

export const configureGithubRepo = makeAggregateContractVersion(
  defineAggregateContract("configureGithubRepo"),
  {
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
      const row = yield* findFirst({ db, model: db.models.brick, where: { id: { eq: payload.brickId } } });
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
      const row = yield* findFirst({ db, model: db.models.brick, where: { id: { eq: payload.brickId } } });
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
  },
);
