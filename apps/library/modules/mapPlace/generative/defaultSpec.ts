import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "map-1",
  elements: {
    "map-1": {
      type: "MapCanvas",
      props: {
        googlePlaceId: { $state: "/googlePlaceId" },
        name: { $state: "/name" },
        latitude: { $state: "/latitude" },
        longitude: { $state: "/longitude" },
      },
    },
  },
};
