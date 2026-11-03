import { updateAggregateActorRelease } from "@zerospin/sdk";
import { userActorV8 } from "./userActorV8";
import { insertStackV1 as insertStack } from "../contracts/wall/InsertStackContractV1";
import { addBrickV5 as addBrick } from "../contracts/wall/AddBrickContractV5";
import { movePlacementToRowV4 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV4";
import { movePlacementToNewRowV3 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV3";
import { movePlacementToNewStackV3 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV3";
import { movePlacementToNewSectionV3 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV3";
import { moveStackV3 as moveStack } from "../contracts/wall/MoveStackContractV3";
import { updateSiteSettingsV2 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV2";

export const userActorV9 = updateAggregateActorRelease(userActorV8, {
  version: 9,
  contracts: {
    insertStack,
    addBrick,
    movePlacementToRow,
    movePlacementToNewRow,
    movePlacementToNewStack,
    movePlacementToNewSection,
    moveStack,
    updateSiteSettings,
  },
});
