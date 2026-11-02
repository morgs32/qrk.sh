import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { createPageV1 } from "./CreatePageV1";
import { wallV2 as wall } from "../../models/wall/WallV2";

export const createPageV2 = upgradeAggregateContractRelease(createPageV1, {
  version: 2,
  models: { wall },
  operations: { createWall: wall.operations.create },
});
