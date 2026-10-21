import type { IAggregateCommand } from "@zerospin/core/contracts/types";
import { makeCommand } from "@zerospin/core/contracts/make/makeCommand";
import { encodeCommand } from "@zerospin/core/contracts/encodeCommand";
import { resolveFailure } from "@zerospin/core/contracts/failureCodec";
import { makeId } from "@zerospin/core/models/make/makeId";
import { readRpcEnvelope } from "@zerospin/core/utils/readRpcEnvelope";
import { ensureZerospinError, ZerospinError } from "@zerospin/error";
import { Effect } from "effect";
import type { AggregateChain } from "system-worker";

import type { userClaims } from "../../../claims";
import { createUserV1 } from "../contracts/createUser/CreateUserV1";
import { userV1 } from "../models/user/UserV1";

/** Provision through the private actor after Clerk verification, before selected-state capture. */
export const provisionAuthenticatedUser = Effect.fn("provisionAuthenticatedUser")(
  function* (props: {
    chain: Pick<AggregateChain, "executeAggregateCommand">;
    aggregateId: string;
    aggregateVersion?: "3.0.0" | "4.0.0";
    claims: typeof userClaims.Type;
  }) {
    const { chain, aggregateId, aggregateVersion = "3.0.0", claims } = props;
    yield* Effect.gen(function* () {
      const original = yield* makeCommand({
        contract: createUserV1,
        payload: {
          id: yield* makeId(userV1),
          clerkUserId: claims.clerkUserId,
          username: null,
          displayName: null,
        },
      });
      const command = yield* encodeCommand({
        contract: createUserV1,
        command: {
          ...original,
          aggregateName: "user",
          aggregateVersion,
          aggregateId,
          origin: { kind: "actor", actorName: "provisioner", actorVersion: "1.0.0", claims },
          nodeId: null,
          sessionName: null,
          pushIndex: null,
        } satisfies IAggregateCommand,
      });
      const envelope = yield* Effect.tryPromise({
        try: () => chain.executeAggregateCommand({ command }),
        catch: (error) => ensureZerospinError({ code: "user-provisioning-failed", error }),
      });
      const result = yield* readRpcEnvelope(envelope).pipe(
        Effect.mapError((failure) =>
          failure.code === "user-already-exists"
            ? new ZerospinError(failure)
            : new ZerospinError({
                code: "user-provisioning-failed",
                message: "User provisioning was not admitted",
                extra: { failure },
              }),
        ),
      );
      if (result.outcome.result._tag === "Success") return;
      const failure = yield* resolveFailure(createUserV1, result.outcome.result.failure);
      if ("code" in failure && failure.code === "user-already-exists") return;
      return yield* new ZerospinError({
        code: "user-provisioning-failed",
        message: "User provisioning failed",
        extra: { failure },
      });
    }).pipe(
      Effect.catchIf(
        (error) => error.code === "user-already-exists",
        () => Effect.void,
      ),
    );
  },
);
