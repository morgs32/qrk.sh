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
} from "@zerospin/sdk";
import { Effect } from "effect";

export const assignUsernameV1 = makeAggregateContractRelease(
  defineAggregateContract("assignUsername"),
  {
    version: 1,
    payload: {
      userId: modelId({ model: user }),
      revision: primitives.integer(),
      requested: primitives.text(),
      username: primitives.text({ nullable: true }),
      failure: primitives.text({ nullable: true }),
    },
    models: {
      user: { model: userV1, fields: ["clerkUserId", "username"] },
      usernameStatus: { model: usernameStatusV1, fields: ["userId", "revision", "pending"] },
    },
    operations: {
      updateUser: userV1.operations.update,
      updateStatus: usernameStatusV1.operations.update,
    },
    failures: {
      invalid: ContractError.schema({ code: "assign-username-invalid" }),
      missing: ContractError.schema({ code: "assign-username-owner-missing" }),
    },
    program: Effect.fn("user.assignUsername")(function* (props) {
      const { aggregateId, payload, db, operations, failures } = props;
      const { userId, revision, requested, username, failure } = payload;
      if (
        !Number.isSafeInteger(revision) ||
        revision < 1 ||
        (failure === null && username !== requested) ||
        (username !== null && !/^[a-z0-9]{1,56}$/.test(username))
      ) {
        return yield* failures.invalid.make({ message: "Invalid username assignment" });
      }
      const owner = yield* findFirst({
        db,
        model: db.models.user,
        where: { id: { eq: userId }, clerkUserId: { eq: aggregateId } },
      });
      const status = yield* findFirst({
        db,
        model: db.models.usernameStatus,
        where: { userId: { eq: userId } },
      });
      if (owner === undefined || status === undefined)
        return yield* failures.missing.make({ message: "Username request owner was not found" });
      if (revision < status.revision || (revision === status.revision && status.pending === null))
        return;
      if (revision !== status.revision || requested !== status.pending)
        return yield* failures.invalid.make({
          message: "Username assignment does not match the current request",
        });
      if (owner.username !== username)
        yield* operations.updateUser({ resourceId: owner.id, attributes: { username } });
      yield* operations.updateStatus({
        resourceId: status.id,
        attributes: { pending: null, failure },
      });
    }),
  },
);
