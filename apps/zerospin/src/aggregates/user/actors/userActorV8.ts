import { updateAggregateActorRelease } from "@zerospin/sdk";
import { userActorV7 } from "./userActorV7";
import { setRowWidthWeightsV1 as setRowWidthWeights } from "../contracts/wall/SetRowWidthWeightsV1";
import { setRowMinHeightV1 as setRowMinHeight } from "../contracts/wall/SetRowMinHeightV1";

export const userActorV8 = updateAggregateActorRelease(userActorV7, {
  version: 8,
  contracts: { setRowWidthWeights, setRowMinHeight },
});
