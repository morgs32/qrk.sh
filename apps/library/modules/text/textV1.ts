import { primitives } from "@zerospin/schema";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeDataForm } from "../../make/makeDataForm";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { defaultSpec } from "./generative/defaultSpec";
import { textBrickComponent } from "./generative/TextBrickComponent";
import { text } from "./text";

const dataShape = {
  content: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: TiptapDocSchema,
  }),
};

export const textV1 = makeModuleVersion(text, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    TextBrick: textBrickComponent,
  },
  data: makeDataForm({
    dataShape,
    defaultData: { content: null },
  }),
  stateShape: dataShape,
  defaultState: { content: null },
  breakpoints: {
    sm: { w: 4, h: 4, defaultSpec },
  },
});
