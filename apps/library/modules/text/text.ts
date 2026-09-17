import { primitives } from "@zerospin/schema";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { defineModule } from "../../make/defineModule";
import { makeDataForm } from "../../make/makeDataForm";
import { defaultSpec } from "./generative/defaultSpec";
import { textBrickComponent } from "./generative/TextBrickComponent";

const dataShape = {
  content: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: TiptapDocSchema,
  }),
};

export const text = defineModule({
  id: "text",
  label: "Text",
  description: "Rich text content authored with Tiptap.",
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
  breakpoints: {
    sm: { w: 4, h: 4, defaultSpec },
  },
});
