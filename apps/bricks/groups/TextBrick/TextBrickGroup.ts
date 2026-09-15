import { createElement } from "react";

import type { JSONContent } from "@tiptap/react";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { makeGroup } from "../../makeGroup";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { TextBrick2x2 } from "./catalogs/default/TextBrick2x2";
import { TextEditorControl } from "./catalogs/default/TextEditorControl";

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

export const textBrickGroup = makeGroup({
  groupName: "text",
  groupLabel: "Text",
  groupDescription: "Rich text content authored with Tiptap.",
  catalogs: {
    default: makeCatalog({
      dataShape,
      defaultData: { content: null },
      catalog: "default",
      catalogName: "Default",
      catalogDescription: "A text content block.",
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) =>
          createElement(TextEditorControl, {
            value: data.content,
            onChange: (content) => onChange({ content }),
          }),
      }),
      order: 1,
      xs: { component: TextBrick2x2, w: 4, h: 4 },
    }),
  },
});
