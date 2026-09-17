import { createElement } from "react";

import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/MapPlaceJsonRenderRegistry";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { MapPlaceBrick } from "./MapPlaceBrick";
import { mapPlaceV1 } from "./mapPlaceV1";

export const mapPlaceFrontend = makeFrontend(mapPlaceV1, {
  registry,
  component: MapPlaceBrick,
  data: {
    payloadForm: ({ value, onChange }) =>
      createElement(GooglePlaceLookup, {
        value: value.googlePlaceId,
        onChange: (googlePlaceId) => onChange({ googlePlaceId }),
      }),
  },
});
