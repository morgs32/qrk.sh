"use client";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../lib/jsonRender/layoutRegistryComponents";
import { mapCanvasView } from "../MapCanvas";
import { mapPlaceV2 } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlaceV2";

export const { registry } = defineRegistry(mapPlaceV2.catalog, {
  components: {
    ...layoutRegistryComponents,
    MapCanvas: mapCanvasView.RegistryComponent,
  },
});
