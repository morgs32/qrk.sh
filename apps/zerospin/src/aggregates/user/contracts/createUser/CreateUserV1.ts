import { user as userIdentity } from "../../models/user/user";

import {
  modelId,
  makeAggregateContractVersion,
  primitives,
  findFirst,
} from "@zerospin/sdk/browser";

import { ContractError } from "@zerospin/error";

import { Effect } from "effect";

import { userV1 as User } from "../../models/user/UserV1";

import { createUser } from "./createUser";

const createUserPayload = {
  id: modelId({ model: userIdentity }),
  clerkUserId: primitives.text(),
  username: primitives.text({
    nullable: true,
  }),
  displayName: primitives.text({
    nullable: true,
  }),
};

export const createUserV1 = makeAggregateContractVersion(createUser, {
  operations: { createUser: User.operations.create },
  payload: createUserPayload,
  models: { user: User },
  failures: {
    userAlreadyExists: ContractError.schema({ code: "user-already-exists" }),
  },
  guard: Effect.fn("createUser.guard")(function* (props) {
    const { db, payload, failures } = props;
    const existingUser = yield* findFirst({
      db,
      model: User,
      where: { clerkUserId: { eq: payload.clerkUserId } },
    });
    if (existingUser !== undefined) {
      return yield* failures.userAlreadyExists.make({
        message: `A user already exists for Clerk user ${payload.clerkUserId}`,
        status: 409,
      });
    }
  }),
  program: (props) => {
    const { operations, payload } = props;
    return Effect.gen(function* () {
      const { id, clerkUserId, username, displayName } = payload;
      yield* operations.createUser({
        resourceId: id,
        attributes: { clerkUserId, username, displayName },
      });
    });
  },
  version: 1,
});
