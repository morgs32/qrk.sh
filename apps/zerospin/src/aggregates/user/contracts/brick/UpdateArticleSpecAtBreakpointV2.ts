import { backendLibrary } from "../../../../modules/backendLibrary";
import { makeModuleSpecDocumentSchema } from "../../../../modules/make/makeModuleSpecDocumentSchema";
import { primitives } from "@zerospin/shapes";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { updateArticleSpecAtBreakpoint } from "./UpdateArticleSpecAtBreakpointV1";

const SpecDocumentSchema = makeModuleSpecDocumentSchema(backendLibrary["article"].components, true);

export const updateArticleSpecAtBreakpointV2 = upgradeAggregateContractVersion(updateArticleSpecAtBreakpoint, {
  version: "2.0.0",
  operations: { updatePlacement: placement.operations.update },
  models: { placement },
  payload: { spec: primitives.json({ schema: SpecDocumentSchema }) },
});
