import { makeAggregateRelease } from "@zerospin/sdk";
import { userActorV1 } from "./userActorV1";
import { userAggregate } from "./userAggregate";
import { createUserV1 } from "./contracts/CreateUserV1";
import { applyDomainAssignmentV1 } from "./contracts/ApplyDomainAssignmentV1";
import { createSiteExtensionV1 } from "./contracts/CreateSiteExtensionV1";

export const userAggregateV1 = makeAggregateRelease(userAggregate, {
  version: 1,
  models: userActorV1.db.models,
  actors: { web: userActorV1 },
  system: { createUser: createUserV1, applyDomainAssignment: applyDomainAssignmentV1 },
  extensions: { createSite: createSiteExtensionV1 },
  external: {},
});
