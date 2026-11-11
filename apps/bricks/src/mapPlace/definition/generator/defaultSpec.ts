import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "map-1",
  elements: {
    "map-1": {
      type: "MapCanvas",
      props: {
        googlePlaceId: { $state: "/data/googlePlaceId" },
        name: { $state: "/data/name" },
        latitude: { $state: "/data/latitude" },
        longitude: { $state: "/data/longitude" },
      },
    },
  },
};
