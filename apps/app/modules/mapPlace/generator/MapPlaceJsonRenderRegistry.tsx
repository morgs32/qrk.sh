"use client";

import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "@qrk.sh/zerospin/src/modules/make/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../jsonRender/layoutRegistryComponents";
import { mapCanvasView } from "../MapCanvas";
import { mapPlaceV1 } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlaceV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(mapPlaceV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      MapCanvas: mapCanvasView.RegistryComponent,
    },
  },
);
