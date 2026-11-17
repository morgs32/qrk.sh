import { defineService, makeServiceRelease } from "@zerospin/sdk";
export const users = defineService({ name: "users" });
import { usernameV1 } from "./UsernameV1";
import { usernameFailureV1 } from "./UsernameFailureV1";
import { assignUsernameV1 } from "./AssignUsernameV1";
import { usersActorV1 } from "./usersActorV1";

export const usersV1 = makeServiceRelease(users, {
  version: 1,
  models: { username: usernameV1, usernameFailure: usernameFailureV1 },
  actors: { web: usersActorV1 },
  system: { assignUsername: assignUsernameV1 },
});
