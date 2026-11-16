import { defineService, makeServiceRelease } from "@zerospin/sdk";
import { setUsernameV1 } from "./SetUsernameV1";
import { usernameV1 } from "./UsernameV1";

export const users = defineService({ name: "users" });

export const usersV1 = makeServiceRelease(users, {
  version: 1,
  models: { username: usernameV1 },
  actors: {},
  system: { setUsername: setUsernameV1 },
});
