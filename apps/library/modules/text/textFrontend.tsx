import { createElement } from "react";

import type { JSONContent } from "@tiptap/react";
import { Schema } from "effect";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/TextJsonRenderRegistry";
import { TextBrick } from "./TextBrick";
import { TextEditorControl } from "./TextEditorControl";
import { textV1 } from "./textV1";

function tipTapDocumentFromData(
  content: Schema.Schema.Type<typeof TiptapDocSchema> | null,
): JSONContent | null {
  if (content === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(content));
}

export const textFrontend = makeFrontend(textV1, {
  registry,
  component: TextBrick,
  data: {
    form: ({ data, onChange }) =>
      createElement(TextEditorControl, {
        value: tipTapDocumentFromData(data.content),
        onChange: (content) =>
          onChange({ content: Schema.decodeUnknownSync(TiptapDocSchema)(content) }),
      }),
  },
});
