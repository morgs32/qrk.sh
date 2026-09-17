import type { Schema } from "effect";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { TextBrickContent } from "./TextBrickContent";

export function TextBrick(props: {
  data: { content: Schema.Schema.Type<typeof TiptapDocSchema> | null };
  breakpointOptions: unknown;
}) {
  return <TextBrickContent content={props.data.content} />;
}
