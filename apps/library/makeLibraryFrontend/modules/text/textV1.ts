import { primitives } from "@zerospin/schema";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
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
  stateShape: dataShape,
  defaultState: { content: null },
});
