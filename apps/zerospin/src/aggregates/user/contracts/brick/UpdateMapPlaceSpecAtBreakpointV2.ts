import { backendLibrary } from "../../../../modules/backendLibrary";
import { makeModuleSpecDocumentSchema } from "../../../../modules/make/makeModuleSpecDocumentSchema";
import { primitives } from "@zerospin/shapes";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateMapPlaceSpecAtBreakpoint } from "./UpdateMapPlaceSpecAtBreakpointV1";

const SpecDocumentSchema = makeModuleSpecDocumentSchema(backendLibrary["map-place"].components, true);

export const updateMapPlaceSpecAtBreakpointV2 = upgradeAggregateContractVersion(updateMapPlaceSpecAtBreakpoint, {
  version: "2.0.0",
  operations: { updatePlacement: placement.operations.update },
  models: { placement },
  payload: { spec: primitives.json({ schema: SpecDocumentSchema }) },
});
