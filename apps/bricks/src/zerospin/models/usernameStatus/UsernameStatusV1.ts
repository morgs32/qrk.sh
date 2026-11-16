import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import { user } from "../user/user";
import { usernameStatus } from "./usernameStatus";

export const usernameStatusV1 = makeModelVersion(usernameStatus, {
  version: 1,
  attributes: {
    userId: modelRef({ model: user, relation: "user", inverse: "usernameStatus", unique: true }),
    revision: primitives.integer(),
    pending: primitives.text({ nullable: true }),
    failure: primitives.text({ nullable: true }),
  },
  indexes: [],
});
