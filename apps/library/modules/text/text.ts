import { primitives } from "@zerospin/schema";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { defineModule } from "../../make/defineModule";
import { makeDataForm } from "../../make/makeDataForm";
import { defaultSpec } from "./generative/defaultSpec";
import { textJsonRenderCatalog } from "./generative/TextJsonRenderCatalog";

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
  catalog: textJsonRenderCatalog,
  data: makeDataForm({
    dataShape,
    defaultData: { content: null },
  }),
  breakpoints: {
    sm: { w: 4, h: 4, defaultSpec },
  },
});
