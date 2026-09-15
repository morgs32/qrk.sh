import { createElement } from "react";

import type { JSONContent } from "@tiptap/react";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { makeCatalog } from "../../makeCatalog";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeRegistry } from "../../makeRegistry";

import { TextBrick2x2 } from "./TextBrick2x2";
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
  registries: {
    default: makeRegistry({
      dataShape,
      defaultData: { content: null },
      registry: "default",
      registryName: "Default",
      registryDescription: "A text content block.",
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
