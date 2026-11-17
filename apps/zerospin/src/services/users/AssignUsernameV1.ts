import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import {
  defineServiceContract,
  findFirst,
  makeServiceContractRelease,
  modelId,
  primitives,
  makeId,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { usernameV1 } from "./UsernameV1";
import { usernameFailureV1 } from "./UsernameFailureV1";

export const assignUsernameResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("assigned"), username: Schema.String }),
  Schema.Struct({ status: Schema.Literal("rejected"), message: Schema.String }),
]);

export const assignUsernameV1 = makeServiceContractRelease(
  defineServiceContract("assignUsername"),
  {
    version: 1,
    payload: {
      userId: modelId({ model: user }),
      aggregateId: primitives.text(),
      username: primitives.text(),
    },
    result: assignUsernameResult,
    models: { username: { model: usernameV1, fields: ["userId", "aggregateId", "username"] } },
    operations: {
      create: usernameV1.operations.create,
      update: usernameV1.operations.update,
      recordFailure: usernameFailureV1.operations.create,
    },
    failures: {},
    program: Effect.fn("users.assignUsername")(function* (props) {
      const { payload, db, operations } = props;
      const { userId, aggregateId, username } = payload;
      const current = yield* findFirst({
        db,
        model: db.models.username,
        where: { userId: { eq: userId } },
      });
      const account = yield* findFirst({
        db,
        model: db.models.username,
        where: { aggregateId: { eq: aggregateId } },
      });
      const occupied = yield* findFirst({
        db,
        model: db.models.username,
        where: { username: { eq: username } },
      });
      const message =
        !/^[a-z0-9]{1,56}$/.test(username) || aggregateId.length === 0
          ? "Use 1–56 lowercase letters or numbers"
          : (current !== undefined && current.aggregateId !== aggregateId) ||
              (account !== undefined && account.userId !== userId)
            ? "This user belongs to another account"
            : occupied !== undefined && occupied.userId !== userId
              ? "That username is already taken"
              : null;
      if (message !== null) {
        yield* operations.recordFailure({
          resourceId: yield* makeId(usernameFailureV1),
          attributes: { userId, aggregateId, username, message },
        });
        return { status: "rejected" as const, message };
      }
      if (current === undefined) {
        yield* operations.create({
          resourceId: `unm_${userId}`,
          attributes: { userId, aggregateId, username },
        });
      } else if (current.username !== username) {
        yield* operations.update({ resourceId: current.id, attributes: { username } });
      }
      return { status: "assigned" as const, username };
    }),
  },
);
