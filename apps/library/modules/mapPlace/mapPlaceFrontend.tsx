import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/MapPlaceJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { MapPlaceBrick } from "./MapPlaceBrick";
import { mapPlaceV1 } from "./mapPlaceV1";

export const mapPlaceFrontend = makeFrontend(mapPlaceV1, {
  registry,
  component: MapPlaceBrick,
  defaultSpec,
});
