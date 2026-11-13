import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { user } from "./user";

export const userV1 = makeModelVersion(user, {
  version: 1,
  attributes: {
    clerkUserId: primitives.text({ unique: true }),
    username: primitives.text({ nullable: true, unique: true }),
    displayName: primitives.text({ nullable: true }),
  },
  indexes: [],
});
