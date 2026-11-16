import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { usernameStatusV1 } from "@qrk.sh/bricks/zerospin/models/usernameStatus/UsernameStatusV1";
import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";

export const requestUsernameV1 = makeAggregateContractRelease(
  defineAggregateContract("requestUsername"),
  {
    version: 1,
    claims: userClaims,
    payload: { userId: modelId({ model: user }), username: primitives.text() },
    models: {
      user: { model: userV1, fields: ["clerkUserId"] },
      usernameStatus: { model: usernameStatusV1, fields: ["userId", "revision"] },
    },
    operations: {
      create: usernameStatusV1.operations.create,
      update: usernameStatusV1.operations.update,
    },
    failures: {
      invalid: ContractError.schema({ code: "username-invalid" }),
      ownerMismatch: ContractError.schema({ code: "username-owner-mismatch" }),
      exhausted: ContractError.schema({ code: "username-revision-exhausted" }),
    },
    guard: Effect.fn("requestUsername.guard")(function* (props) {
      const { payload, claims, db, failures } = props;
      if (!/^[a-z0-9]{1,56}$/.test(payload.username)) {
        return yield* failures.invalid.make({ message: "Use 1–56 lowercase letters or numbers" });
      }
      const owner = yield* findFirst({
        db,
        model: db.models.user,
        where: { id: { eq: payload.userId }, clerkUserId: { eq: claims.clerkUserId } },
      });
      if (owner === undefined)
        return yield* failures.ownerMismatch.make({
          message: "This user belongs to another account",
        });
    }),
    program: Effect.fn("requestUsername")(function* (props) {
      const { payload, db, operations, failures } = props;
      const status = yield* findFirst({
        db,
        model: db.models.usernameStatus,
        where: { userId: { eq: payload.userId } },
      });
      if (status !== undefined && status.revision >= Number.MAX_SAFE_INTEGER) {
        return yield* failures.exhausted.make({ message: "Username revision limit reached" });
      }
      const revision = (status?.revision ?? 0) + 1;
      if (status === undefined) {
        const id: `uns_${string}` = `uns_${payload.userId}`;
        yield* operations.create({
          resourceId: id,
          attributes: {
            userId: payload.userId,
            revision,
            pending: payload.username,
            failure: null,
          },
        });
      } else {
        yield* operations.update({
          resourceId: status.id,
          attributes: { revision, pending: payload.username, failure: null },
        });
      }
    }),
  },
);
