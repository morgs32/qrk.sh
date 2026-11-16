import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { makeModelVersion, modelId, primitives } from "@zerospin/sdk/browser";
import { username } from "./username";

export const usernameV1 = makeModelVersion(username, {
  version: 1,
  attributes: {
    username: primitives.text({ unique: true, nullable: true }),
    userId: modelId({ model: user, unique: true }),
    aggregateId: primitives.text({ unique: true }),
    revision: primitives.integer(),
    requested: primitives.text(),
    accepted: primitives.boolean(),
  },
  indexes: [],
});
