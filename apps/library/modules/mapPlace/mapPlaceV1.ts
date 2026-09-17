import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { mapCanvasComponent } from "./generative/MapCanvasComponent";
import { mapPlace } from "./mapPlace";

const payloadShape = {
  googlePlaceId: primitives.text({
    defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
  }),
};

const dataShape = {
  googlePlaceId: primitives.text(),
  name: primitives.text(),
  address: primitives.text(),
  latitude: primitives.number(),
  longitude: primitives.number(),
};

const defaultData = {
  googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
  name: "Downtown Chicago",
  address: "Chicago, IL, USA",
  latitude: 41.8781136,
  longitude: -87.6297982,
};

export const mapPlaceV1 = makeModuleVersion(mapPlace, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    MapCanvas: mapCanvasComponent,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8" },
    data: defaultData,
  },
});
