import { createElement } from "react";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { primitives } from "@zerospin/schema";
import type { JSONContent } from "@tiptap/react";
import { Schema } from "effect";

import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
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

export const textBrickCollection = makeCollection({
  collectionName: "text",
  collectionLabel: "Text",
  collectionDescription: "Rich text content authored with Tiptap.",
  variants: {
    default: makeVariant({
      dataShape,
      defaultData: { content: null },
      variant: "default",
      variantName: "Default",
      variantDescription: "A text content block.",
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) =>
          createElement(TextEditorControl, {
            value: data.content,
            onChange: (content) => onChange({ content }),
          }),
      }),
      layouts: {
        "4x4": makeBrick({
          variant: "default",
          layout: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 1,
          component: TextBrick2x2,
        }),
        "8x2": makeBrick({
          variant: "default",
          layout: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 0,
          component: TextBrick4x1,
        }),
      },
    }),
  },
});
