import {
  makeActorIdentity,
  defineServiceActor,
  makeServiceActorRelease,
  makeQueryDbVersion,
} from "@zerospin/sdk";
import { RoutePattern } from "@remix-run/route-pattern";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { userActorV1 } from "../../fresh/userActorV1";
import { usernameV1 } from "./UsernameV1";
import { usernameFailureV1 } from "./UsernameFailureV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeQueryDbVersion({
  models: { username: usernameV1, usernameFailure: usernameFailureV1 },
});

export const usersActorV1 = makeServiceActorRelease(defineServiceActor({ name: "web" }), {
  version: 1,
  db,
  identity,
  authentication: userActorV1.authentication,
  exposedModels: { username: usernameV1, usernameFailure: usernameFailureV1 },
  contracts: {},
  selections: {
    username: db.query.username.findMany({
      where: { aggregateId: { eq: identity.sql.placeholder("clerkUserId") } },
    }),
    usernameFailure: db.query.usernameFailure.findMany({
      where: { aggregateId: { eq: identity.sql.placeholder("clerkUserId") } },
    }),
  },
});
