import { updateAggregateActorRelease } from "@zerospin/sdk";
import { renameStackV1 } from "../contracts/wall/RenameStackContractV1";
import { userActorV3 } from "./userActorV3";

export const userActorV4 = updateAggregateActorRelease(userActorV3, {
  version: 4,
  contracts: { renameStack: renameStackV1 },
});
