import { primitives } from "@zerospin/core/models/primitives";
import type { JSONContent } from "@tiptap/react";
import { Schema } from "effect";

import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { TextBrick2x2 } from "./TextBrick2x2";
import { TextBrick4x1 } from "./TextBrick4x1";
import { TextEditorControl } from "./TextEditorControl";

export const textBrickCollection = makeCollection({
  collectionName: "text",
  collectionLabel: "Text",
  collectionDescription: "Rich text content authored with Tiptap.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "A text content block.",
      payloadShape: {
        content: primitives.json({
          nullable: true,
          defaultValue: null,
          schema: Schema.declare(
            (input): input is JSONContent =>
              typeof input === "object" &&
              input !== null &&
              "type" in input &&
              input.type === "doc",
          ),
        }),
      },
      payloadForm: {
        content: TextEditorControl,
      },
      sizes: {
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 1,
          component: TextBrick2x2,
        }),
        "8x2": makeBrick({
          variant: "default",
          size: "8x2",
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
