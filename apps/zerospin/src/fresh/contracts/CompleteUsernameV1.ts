import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { usernameStatusV1 } from "@qrk.sh/bricks/zerospin/models/usernameStatus/UsernameStatusV1";
import { findFirst, makeAggregateCommandContinuation, modelId, primitives } from "@zerospin/sdk";
import { Effect } from "effect";
import { setUsernameV1 } from "../../services/users/SetUsernameV1";

export const completeUsernameV1 = makeAggregateCommandContinuation({
  name: "completeUsername",
  version: 1,
  destination: setUsernameV1,
  payload: {
    userId: modelId({ model: user }),
    revision: primitives.integer(),
    requested: primitives.text(),
  },
  models: { usernameStatus: { model: usernameStatusV1, fields: ["userId", "revision", "pending"] } },
  operations: { update: usernameStatusV1.operations.update },
  failures: {},
  program: Effect.fn("user.completeUsername")(function* (props) {
    const { payload, outcome, db, operations } = props;
    if (outcome.result._tag !== "Failure") return;
    const status = yield* findFirst({
      db,
      model: db.models.usernameStatus,
      where: { userId: { eq: payload.userId } },
    });
    if (
      status === undefined ||
      status.revision !== payload.revision ||
      status.pending !== payload.requested
    )
      return;
    yield* operations.update({
      resourceId: status.id,
      attributes: { pending: null, failure: "Could not save your username" },
    });
  }),
});
