import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { MapPlaceBrick } from "./MapPlaceBrick";
import { mapPlaceV1 } from "./mapPlaceV1";

export const mapPlaceView = makeModuleView(mapPlaceV1, {
  default: {
    component: MapPlaceBrick,
    generator: { registry, defaultSpec },
  },
});
