import {
  defineCatalog,
  DynamicNumberSchema,
  DynamicStringSchema,
} from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const mapPlaceJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    MapCanvas: {
      props: z.object({
        googlePlaceId: DynamicStringSchema,
        name: DynamicStringSchema,
        latitude: DynamicNumberSchema,
        longitude: DynamicNumberSchema,
      }),
      description:
        'Mapbox map canvas centered on a place. Bind googlePlaceId, name, latitude, longitude from state.',
    },
  },
  actions: {},
});
