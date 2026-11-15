import { updateAggregateActorRelease } from "@zerospin/sdk";

import { createPageV2 as createPage } from "./contracts/CreatePageV2";
import { userActorV1 } from "./userActorV1";

export const userActorV2 = updateAggregateActorRelease(userActorV1, {
  version: 2,
  contracts: { createPage },
});
