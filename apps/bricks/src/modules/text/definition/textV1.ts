import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";
import { defineModule } from "../../../definition/defineModule";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { isTextMarkdown } from "./textDocument";

export const textBlockComponentMetadata = defineComponentMetadata({
  type: "TextBlock",
  propsShape: {
    content: primitives.text(),
    fontFamily: primitives.enum({ values: ["sans", "serif", "mono"] }),
    fontSizePx: primitives.json({ schema: Schema.Finite.check(Schema.isGreaterThan(0)) }),
  },
  description: "One text block using the Placement's font family and size.",
});

export const textV1 = makeModuleVersion(
  defineModule({ id: "text", abbreviation: "txt", label: "Text", description: "A single formatted text block." }),
  {
    version: 1,
    variants: { default: { defaultWidth: 320, minWidth: 320, defaultHeight: 45 } },
    hasPlaceholder: false,
    componentMetadata: { TextBlock: textBlockComponentMetadata },
    defaultSpec: {
      root: "text",
      elements: {
        text: {
          type: "TextBlock",
          props: {
            content: { $state: "/brickState/content" },
            fontFamily: { $state: "/placementState/fontFamily" },
            fontSizePx: { $state: "/placementState/fontSizePx" },
          },
        },
      },
    },
    stateShape: { content: primitives.text() },
  },
);

export const completeStateSchema = Schema.toType(makeEffectSchema(textV1.stateShape)).check(
  Schema.makeFilter(({ content }) => isTextMarkdown(content) || "Text must contain one block without line breaks"),
);
