import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { ContractError } from "@zerospin/error";
import {
  defineServiceContract,
  findFirst,
  makeCommandOperation,
  makeServiceContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk";
import { Effect, Schema } from "effect";
import { usernameV1 } from "./UsernameV1";
import { userAggregate } from "../../fresh/userAggregate";
import { assignUsernameV1 } from "../../fresh/contracts/AssignUsernameV1";

const setUsername = defineServiceContract("setUsername");

export const setUsernameV1 = makeServiceContractRelease(setUsername, {
  version: 1,
  payload: {
    userId: modelId({ model: user }),
    aggregateId: primitives.text(),
    username: primitives.text(),
    revision: primitives.integer(),
  },
  result: Schema.Union([
    Schema.Struct({
      status: Schema.Literal("saved"),
      username: Schema.String,
      revision: Schema.Number,
    }),
    Schema.Struct({ status: Schema.Literal("taken"), revision: Schema.Number }),
    Schema.Struct({ status: Schema.Literal("superseded"), revision: Schema.Number }),
  ]),
  models: { username: { model: usernameV1, fields: ["username", "userId", "aggregateId", "revision", "requested", "accepted"] } },
  operations: {
    create: usernameV1.operations.create,
    update: usernameV1.operations.update,
    assignUsername: makeCommandOperation({
      destination: { aggregate: userAggregate, version: 4 },
      contract: assignUsernameV1,
    }),
  },
  failures: {
    invalid: ContractError.schema({ code: "username-invalid" }),
    ownerMismatch: ContractError.schema({ code: "username-owner-mismatch" }),
    revisionConflict: ContractError.schema({ code: "username-revision-conflict" }),
  },
  program: Effect.fn("users.setUsername")(function* (props) {
    const { payload, db, operations, failures } = props;
    const { userId, aggregateId, username, revision } = payload;
    if (
      !/^[a-z0-9]{1,56}$/.test(username) ||
      aggregateId.length === 0 ||
      !Number.isSafeInteger(revision) ||
      revision < 1
    ) {
      return yield* failures.invalid.make({ message: "Use 1–56 lowercase letters or numbers" });
    }
    const existing = yield* findFirst({
      db,
      model: db.models.username,
      where: { userId: { eq: userId } },
    });
    if (existing !== undefined && existing.aggregateId !== aggregateId) {
      return yield* failures.ownerMismatch.make({
        message: "This user belongs to another account",
      });
    }
    if (existing === undefined) {
      const account = yield* findFirst({
        db,
        model: db.models.username,
        where: { aggregateId: { eq: aggregateId } },
      });
      if (account !== undefined) {
        return yield* failures.ownerMismatch.make({
          message: "This account already belongs to another user",
        });
      }
    }
    if (existing !== undefined && existing.revision >= revision) {
      if (existing.revision === revision && existing.requested !== username) {
        return yield* failures.revisionConflict.make({
          message: "This username request conflicts with an earlier request",
        });
      }
      if (existing.revision > revision)
        return { status: "superseded" as const, revision: existing.revision };
      if (!existing.accepted) {
        yield* operations.assignUsername({
          aggregateId,
          payload: {
            userId,
            revision,
            requested: username,
            username: existing.username,
            failure: "That username is already taken",
          },
        });
        return { status: "taken" as const, revision };
      }
      if (existing.username === null)
        return yield* failures.revisionConflict.make({ message: "Saved username is missing" });
      yield* operations.assignUsername({
        aggregateId,
        payload: { userId, revision, requested: username, username, failure: null },
      });
      return { status: "saved" as const, username: existing.username, revision };
    }
    const occupied = yield* findFirst({
      db,
      model: db.models.username,
      where: { username: { eq: username } },
    });
    const accepted = occupied === undefined || occupied.userId === userId;
    if (existing === undefined) {
      const id: `unm_${string}` = `unm_${userId}`;
      yield* operations.create({
        resourceId: id,
        attributes: {
          userId,
          aggregateId,
          username: accepted ? username : null,
          revision,
          requested: username,
          accepted,
        },
      });
    } else {
      yield* operations.update({
        resourceId: existing.id,
        attributes: { ...(accepted ? { username } : {}), revision, requested: username, accepted },
      });
    }
    yield* operations.assignUsername({
      aggregateId,
      payload: {
        userId,
        revision,
        requested: username,
        username: accepted ? username : (existing?.username ?? null),
        failure: accepted ? null : "That username is already taken",
      },
    });
    return accepted
      ? { status: "saved" as const, username, revision }
      : { status: "taken" as const, revision };
  }),
});
