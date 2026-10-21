import { backendLibrary } from "../../../../modules/backendLibrary";
import { makeModuleSpecDocumentSchema } from "../../../../modules/make/makeModuleSpecDocumentSchema";
import { primitives } from "@zerospin/shapes";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateFigmaThumbnailSpecAtBreakpoint } from "./UpdateFigmaThumbnailSpecAtBreakpointV1";

const SpecDocumentSchema = makeModuleSpecDocumentSchema(backendLibrary["figma-thumbnail"].components, true);

export const updateFigmaThumbnailSpecAtBreakpointV2 = upgradeAggregateContractVersion(updateFigmaThumbnailSpecAtBreakpoint, {
  version: "2.0.0",
  operations: { updatePlacement: placement.operations.update },
  models: { placement },
  payload: { spec: primitives.json({ schema: SpecDocumentSchema }) },
});
