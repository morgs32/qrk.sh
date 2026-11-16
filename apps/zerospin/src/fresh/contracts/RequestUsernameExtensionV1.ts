import { usernameStatusV1 } from "@qrk.sh/bricks/zerospin/models/usernameStatus/UsernameStatusV1";
import { findFirst, makeAggregateContractExtension, makeCommandOperation } from "@zerospin/sdk";
import { Effect } from "effect";
import { users } from "../../services/users/usersV1";
import { setUsernameV1 } from "../../services/users/SetUsernameV1";
import { completeUsernameV1 } from "./CompleteUsernameV1";
import { requestUsernameV1 } from "./RequestUsernameV1";

export const requestUsernameExtensionV1 = makeAggregateContractExtension(requestUsernameV1, {
  models: { usernameStatus: { model: usernameStatusV1, fields: ["userId", "revision", "pending"] } },
  operations: {
    setUsername: makeCommandOperation({
      destination: { service: users, version: 1 },
      contract: setUsernameV1,
      continuation: completeUsernameV1,
    }),
  },
  program: Effect.fn("user.requestUsername.extension")(function* (props) {
    const { aggregateId, payload, db, operations, failures } = props;
    const status = yield* findFirst({
      db,
      model: db.models.usernameStatus,
      where: { userId: { eq: payload.userId } },
    });
    if (status === undefined || status.pending !== payload.username)
      return yield* failures.invalid.make({ message: "Username request was not recorded" });
    yield* operations.setUsername({
      payload: {
        userId: payload.userId,
        aggregateId,
        username: payload.username,
        revision: status.revision,
      },
      continuationPayload: {
        userId: payload.userId,
        revision: status.revision,
        requested: payload.username,
      },
    });
  }),
});
