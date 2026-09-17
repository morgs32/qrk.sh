import { createElement } from "react";

import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/SwatchAndIconJsonRenderRegistry";
import { StreamlineIconLookup } from "./StreamlineIconLookup";
import { SwatchAndIconBrick } from "./SwatchAndIconBrick";
import { SwatchAndIconColorForm } from "./SwatchAndIconColorForm";
import { swatchAndIcon } from "./swatchAndIcon";

export const swatchAndIconFrontend = makeFrontend(swatchAndIcon, {
  registry,
  component: SwatchAndIconBrick,
  data: {
    payloadForm: ({ value, onChange }) =>
      createElement(StreamlineIconLookup, {
        value: value.hash,
        onChange: (hash) => onChange({ hash }),
      }),
  },
  breakpoints: {
    sm: { options: { form: SwatchAndIconColorForm } },
  },
});
