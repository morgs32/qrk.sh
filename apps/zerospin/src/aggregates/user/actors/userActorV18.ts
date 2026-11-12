import { updateAggregateActorRelease } from "@zerospin/sdk";
import { addBrickV11 } from "../contracts/wall/AddBrickContractV11";
import { updateBrickV12 } from "../contracts/brick/UpdateBrickV12";
import { userActorV17 } from "./userActorV17";

export const userActorV18 = updateAggregateActorRelease(userActorV17, {
  version: 18,
  contracts: { addBrick: addBrickV11, updateBrick: updateBrickV12 },
});
