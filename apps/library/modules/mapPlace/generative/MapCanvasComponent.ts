import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const mapCanvasComponent = defineComponent({
  type: "MapCanvas",
  props: {
    googlePlaceId: primitives.text(),
    name: primitives.text(),
    latitude: primitives.number(),
    longitude: primitives.number(),
  },
  description:
    "Mapbox map canvas centered on a place. Bind googlePlaceId, name, latitude, longitude from state.",
});
