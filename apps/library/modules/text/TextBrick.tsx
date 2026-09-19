import type { Schema } from "effect";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { TextBrickContent } from "./TextBrickContent";

export function TextBrick(props: {
  state: { content: Schema.Schema.Type<typeof TiptapDocSchema> | null };
}) {
  return <TextBrickContent content={props.state.content} />;
}
