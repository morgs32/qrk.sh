import { defineRegistry } from "@json-render/react";
import { Schema } from "effect";

import { TiptapDocSchema } from "../../../lib/TiptapDocSchema";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { TextBrickContent } from "../TextBrickContent";
import { text } from "../text";

function contentFromProps(value: unknown): Schema.Schema.Type<typeof TiptapDocSchema> | null {
  const result = Schema.decodeUnknownOption(TiptapDocSchema)(value);
  return result._tag === "Some" ? result.value : null;
}

export const { registry } = defineRegistry(text.catalog, {
  components: {
    ...layoutRegistryComponents,
    TextBrick: ({ props }: { props: Record<string, unknown> }) => (
      <TextBrickContent content={contentFromProps(props.content)} />
    ),
  },
});
