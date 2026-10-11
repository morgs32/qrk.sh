import * as sdk from "@zerospin/sdk/browser";

import { makeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
import { AggregateError } from "@zerospin/error";
import { userV1 as User } from "../../models/user/UserV1";

import { createUser } from "./createUser";

const createUserPayload = {
  id: primitives.foreignKey({ abbreviation: User.abbreviation }),
  clerkUserId: primitives.text(),
  username: primitives.text({
    nullable: true,
  }),
  displayName: primitives.text({
    nullable: true,
  }),
};

export const createUserV1 = makeAggregateContractVersion(createUser, {
  payload: createUserPayload,
  models: { user: User },
  failures: {
    userAlreadyExists: AggregateError.schema({ code: "user-already-exists" }),
    createUserIdentityMismatch: AggregateError.schema({ code: "create-user-identity-mismatch" }),
  },
  program: (props) => {
    const { payload } = props;
    const { id, clerkUserId, username, displayName } = payload;
    return sdk.makeCreateOperation({
      model: User,
      resourceId: id,
      attributes: { clerkUserId, username, displayName },
    });
  },
  version: "1.0.0",
});
