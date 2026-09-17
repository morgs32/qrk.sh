import { primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { defaultSpec } from "./generative/defaultSpec";
import { mapCanvasComponent } from "./generative/MapCanvasComponent";

export const mapPlace = defineModule({
  id: "map-place",
  label: "Map Place",
  description: "A map centered on one selected place.",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    MapCanvas: mapCanvasComponent,
  },
  data: makeDataFetcher({
    payloadShape: {
      googlePlaceId: primitives.text({
        defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      }),
    },
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.googlePlacesBackend().getPlace(payload.googlePlaceId);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
    dataShape: {
      googlePlaceId: primitives.text(),
      name: primitives.text(),
      address: primitives.text(),
      latitude: primitives.number(),
      longitude: primitives.number(),
    },
    defaultData: {
      googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      name: "Downtown Chicago",
      address: "Chicago, IL, USA",
      latitude: 41.8781136,
      longitude: -87.6297982,
    },
  }),
  breakpoints: {
    sm: { w: 4, h: 4, defaultSpec },
  },
});
