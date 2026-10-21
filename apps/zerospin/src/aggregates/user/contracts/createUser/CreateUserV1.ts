import { user as userIdentity } from "../../models/user/user";

import { modelId, makeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
import { AggregateError } from "@zerospin/error";
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
    userAlreadyExists: AggregateError.schema({ code: "user-already-exists" }),
    createUserIdentityMismatch: AggregateError.schema({ code: "create-user-identity-mismatch" }),
  },
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
  version: "1.0.0",
});
