import { updateAggregateActorRelease } from "@zerospin/sdk";
import { updateBrickV8 as updateBrick } from "../contracts/brick/UpdateBrickV8";
import { deleteStackV1 as deleteStack } from "../contracts/wall/DeleteStackContractV1";
import { userActorV12 } from "./userActorV12";

export const userActorV13 = updateAggregateActorRelease(userActorV12, {
  version: 13,
  contracts: { deleteStack, updateBrick },
});
