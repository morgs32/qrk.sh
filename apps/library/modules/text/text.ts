import { createElement } from "react";

import type { JSONContent } from "@tiptap/react";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { makeFormConfiguration } from "../../make/makeFormConfiguration";
import { makeModule } from "../../make/makeModule";

import { defaultSpec } from "./generative/defaultSpec";
import { registry } from "./generative/TextJsonRenderRegistry";
import { TextEditorControl } from "./TextEditorControl";

const dataShape = {
  content: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: TiptapDocSchema,
  }),
};

function tipTapDocumentFromData(
  content: Schema.Schema.Type<typeof TiptapDocSchema> | null,
): JSONContent | null {
  if (content === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(content));
}

export const text = makeModule({
  dataShape,
  defaultData: { content: null },
  id: "text",
  label: "Text",
  description: "Rich text content authored with Tiptap.",
  defaultSpec,
  registry,
  configuration: makeFormConfiguration<typeof dataShape>({
    form: ({ data, onChange }) =>
      createElement(TextEditorControl, {
        value: tipTapDocumentFromData(data.content),
        onChange: (content) =>
          onChange({ content: Schema.decodeUnknownSync(TiptapDocSchema)(content) }),
      }),
  }),
  sm: { w: 4, h: 4 },
});
