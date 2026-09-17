import { primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { defaultSpec } from "./generative/defaultSpec";
import { iconSvgGraphicComponent } from "./generative/IconSvgGraphicComponent";
import { swatchAndIconColorComponent } from "./generative/SwatchAndIconColorComponent";
import { swatchAndIcon } from "./swatchAndIcon";

export const swatchAndIconV1 = makeModuleVersion(swatchAndIcon, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    SwatchAndIconColor: swatchAndIconColorComponent,
    IconSvgGraphic: iconSvgGraphicComponent,
  },
  data: makeDataFetcher({
    payloadShape: {
      hash: primitives.text({ defaultValue: "" }),
    },
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.streamlineBackend().getSvg(payload.hash);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
    dataShape: {
      name: primitives.text(),
      svg: primitives.text(),
    },
    defaultData: {
      name: "Asterisk",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>',
    },
  }),
  breakpoints: {
    sm: {
      defaultSpec,
      options: { shape: { color: primitives.text({ defaultValue: "#4A7C59" }) } },
    },
  },
});
