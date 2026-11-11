import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";

export const mapCanvasComponentMetadata = defineComponentMetadata({
  type: "MapCanvas",
  propsShape: {
    googlePlaceId: primitives.text(),
    name: primitives.text(),
    latitude: primitives.number(),
    longitude: primitives.number(),
  },
  description:
    "Mapbox map canvas centered on a place. Bind googlePlaceId, name, latitude, longitude from state.",
});
