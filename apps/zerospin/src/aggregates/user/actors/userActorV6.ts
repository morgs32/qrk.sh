import { updateAggregateActorRelease } from "@zerospin/sdk";
import { movePlacementToRowV2 } from "../contracts/wall/MovePlacementToRowContractV2";
import { userActorV5 } from "./userActorV5";

export const userActorV6 = updateAggregateActorRelease(userActorV5, {
  version: 6,
  contracts: { movePlacementToRow: movePlacementToRowV2 },
});
