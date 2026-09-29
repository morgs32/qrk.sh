"use client";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { mapCanvasView } from "../MapCanvas";
import { mapPlaceV1 } from "../mapPlaceV1";

export const { registry } = defineRegistry(mapPlaceV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    MapCanvas: mapCanvasView.RegistryComponent,
  },
});
