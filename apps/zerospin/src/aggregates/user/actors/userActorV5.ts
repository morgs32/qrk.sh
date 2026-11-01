import { updateSiteSettingsV1 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createPageV1 as createPage } from "../contracts/createPage/CreatePageV1";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";
import { addBrickV3 as addBrick } from "../contracts/wall/AddBrickContractV3";
import { addWallSectionV1 as addWallSection } from "../contracts/wall/AddWallSectionContractV1";
import { moveStackV1 as moveStack } from "../contracts/wall/MoveStackContractV1";
import { deleteBrickV2 as deleteBrick } from "../contracts/wall/DeleteBrickContractV2";
import { updateBrickV3 as updateBrick } from "../contracts/brick/UpdateBrickV3";
import { generateBrickSpecV2 as generateBrickSpec } from "../contracts/brick/GenerateBrickSpecV2";
import { publishSiteV2 as publishSite } from "../contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "../contracts/publishPage/PublishPageV2";
import { defineAggregateActor, makeAggregateActorRelease } from "@zerospin/sdk";
import { renameStackV1 as renameStack } from "../contracts/wall/RenameStackContractV1";
import { movePlacementToRowV1 as movePlacementToRow } from "../contracts/wall/MovePlacementToRowContractV1";
import { movePlacementToNewRowV1 as movePlacementToNewRow } from "../contracts/wall/MovePlacementToNewRowContractV1";
import { movePlacementToNewStackV1 as movePlacementToNewStack } from "../contracts/wall/MovePlacementToNewStackContractV1";
import { movePlacementToNewSectionV1 as movePlacementToNewSection } from "../contracts/wall/MovePlacementToNewSectionContractV1";
import { setBrickBorderWidthV1 as setBrickBorderWidth } from "../contracts/brick/SetBrickBorderWidthV1";
import { userActorV4 } from "./userActorV4";

export const userActorV5 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 5,
  db: userActorV4.db,
  exposedModels: userActorV4.exposedModels,
  identity: userActorV4.identity,
  authentication: userActorV4.authentication,
  authorize: userActorV4.authorize,
  selections: userActorV4.selections,
  contracts: {
    addBrick,
    addWallSection,
    movePlacementToRow,
    movePlacementToNewRow,
    movePlacementToNewStack,
    movePlacementToNewSection,
    moveStack,
    renameStack,
    deleteBrick,
    updateBrick,
    setBrickBorderWidth,
    generateBrickSpec,
    publishSite,
    publishPage,
    updateSiteSettings,
    updatePageSettings,
    createSite,
    createPage,
    unpublishSite,
  },
});
