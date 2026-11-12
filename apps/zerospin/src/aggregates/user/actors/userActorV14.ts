import { updateAggregateActorRelease } from "@zerospin/sdk";
import { deleteStackV2 as deleteStack } from "../contracts/wall/DeleteStackContractV2";
import { userActorV13 } from "./userActorV13";

export const userActorV14 = updateAggregateActorRelease(userActorV13, {
  version: 14,
  contracts: { deleteStack },
});
