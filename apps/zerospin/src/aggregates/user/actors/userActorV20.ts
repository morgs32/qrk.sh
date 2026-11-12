import { defineAggregateActor, makeAggregateActorRelease } from "@zerospin/sdk";
import { addBrickV13 } from "../contracts/wall/AddBrickContractV13";
import { updateBrickV14 } from "../contracts/brick/UpdateBrickV14";
import { userActorV19 } from "./userActorV19";

export const userActorV20 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 20,
  db: userActorV19.db,
  identity: userActorV19.identity,
  authentication: userActorV19.authentication,
  authorize: userActorV19.authorize,
  exposedModels: userActorV19.exposedModels,
  selections: userActorV19.selections,
  contracts: { ...userActorV19.contracts, addBrick: addBrickV13, updateBrick: updateBrickV14 },
});
