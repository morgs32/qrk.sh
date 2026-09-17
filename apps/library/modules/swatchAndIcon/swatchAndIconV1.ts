import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { iconSvgGraphicComponent } from "./generative/IconSvgGraphicComponent";
import { swatchAndIconColorComponent } from "./generative/SwatchAndIconColorComponent";
import { swatchAndIcon } from "./swatchAndIcon";

const payloadShape = {
  hash: primitives.text({ defaultValue: "" }),
};

const dataShape = {
  name: primitives.text(),
  svg: primitives.text(),
};

const defaultData = {
  name: "Asterisk",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>',
};

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
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { hash: "" },
    data: defaultData,
  },
});
