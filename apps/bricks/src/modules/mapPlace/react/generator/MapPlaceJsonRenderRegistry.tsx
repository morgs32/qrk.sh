"use client";

import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../../definition/makeCatalogFromComponentMetadata";

import { layoutRegistryComponents } from "../../../react/layoutRegistryComponents";
import { mapCanvasView } from "../MapCanvas";
import { mapPlaceV1 } from "../../definition/mapPlaceV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(mapPlaceV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      MapCanvas: mapCanvasView.RegistryComponent,
    },
  },
);
