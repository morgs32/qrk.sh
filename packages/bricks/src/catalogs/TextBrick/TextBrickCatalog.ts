import { createElement } from "react";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { primitives } from "@zerospin/schema";
import type { JSONContent } from "@tiptap/react";
import { Schema } from "effect";

import { makeView } from "../../makeView";
import { makeCatalog } from "../../makeCatalog";
import { makeContent } from "../../makeContent";
import { TextBrick2x2 } from "./TextBrick2x2";
import { TextBrick4x1 } from "./TextBrick4x1";
import { TextEditorControl } from "./TextEditorControl";

const dataShape = {
  content: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: Schema.declare(
      (input): input is JSONContent =>
        typeof input === "object" && input !== null && "type" in input && input.type === "doc",
    ),
  }),
};

export const textBrickCatalog = makeCatalog({
  catalogName: "text",
  catalogLabel: "Text",
  catalogDescription: "Rich text content authored with Tiptap.",
  contents: {
    default: makeContent({
      dataShape,
      defaultData: { content: null },
      content: "default",
      contentName: "Default",
      contentDescription: "A text content block.",
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) =>
          createElement(TextEditorControl, {
            value: data.content,
            onChange: (content) => onChange({ content }),
          }),
      }),
      views: {
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 1,
          xs: TextBrick2x2,
        }),
        "8x2": makeView({
          id: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 0,
          xs: TextBrick4x1,
        }),
      },
    }),
  },
});
