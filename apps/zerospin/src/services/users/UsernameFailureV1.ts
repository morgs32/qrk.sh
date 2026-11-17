import { makeModelVersion, modelId, primitives } from "@zerospin/sdk/browser";
import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { usernameFailure } from "./usernameFailure";

export const usernameFailureV1 = makeModelVersion(usernameFailure, {
  version: 1,
  attributes: {
    userId: modelId({ model: user }),
    aggregateId: primitives.text(),
    username: primitives.text(),
    message: primitives.text(),
  },
  indexes: [],
});
