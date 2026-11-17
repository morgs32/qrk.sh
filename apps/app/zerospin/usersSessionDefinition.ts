import { makeServiceSessionDefinition } from "@zerospin/browser";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { usernameV1 } from "@qrk.sh/zerospin/src/services/users/UsernameV1";
import { usernameFailureV1 } from "@qrk.sh/zerospin/src/services/users/UsernameFailureV1";

export const usersSessionDefinition = makeServiceSessionDefinition({
  systemName: "qrk-sh",
  serviceName: "users",
  serviceVersion: 1,
  actorName: "web",
  actorVersion: 1,
  sessionName: "usersSession",
  claimsSchema: userClaims,
  models: { username: usernameV1, usernameFailure: usernameFailureV1 },
  contracts: {},
});
