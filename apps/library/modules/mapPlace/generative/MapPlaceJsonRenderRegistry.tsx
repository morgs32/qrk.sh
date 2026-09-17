"use client";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { MapCanvas as MapCanvasLeaf } from "../MapPlaceBrick";
import { mapPlace } from "../mapPlace";

export const { registry } = defineRegistry(mapPlace.catalog, {
  components: {
    ...layoutRegistryComponents,
    MapCanvas: ({ props }: { props: Record<string, unknown> }) => (
      <MapCanvasLeaf
        googlePlaceId={typeof props.googlePlaceId === "string" ? props.googlePlaceId : ""}
        name={typeof props.name === "string" ? props.name : ""}
        latitude={typeof props.latitude === "number" ? props.latitude : 0}
        longitude={typeof props.longitude === "number" ? props.longitude : 0}
      />
    ),
  },
});
