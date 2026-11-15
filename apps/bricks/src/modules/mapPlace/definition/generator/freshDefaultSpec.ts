import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "map-1",
  elements: {
    "map-1": {
      type: "MapCanvas",
      props: {
        googlePlaceId: { $state: "/brickState/data/googlePlaceId" },
        name: { $state: "/brickState/data/name" },
        latitude: { $state: "/brickState/data/latitude" },
        longitude: { $state: "/brickState/data/longitude" },
      },
    },
  },
};
