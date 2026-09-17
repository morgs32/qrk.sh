import { createElement } from "react";

import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/MapPlaceJsonRenderRegistry";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { mapPlace } from "./mapPlace";

export const mapPlaceFrontend = makeFrontend(mapPlace, {
  registry,
  data: {
    payloadForm: ({ value, onChange }) =>
      createElement(GooglePlaceLookup, {
        value: value.googlePlaceId,
        onChange: (googlePlaceId) => onChange({ googlePlaceId }),
      }),
  },
});
