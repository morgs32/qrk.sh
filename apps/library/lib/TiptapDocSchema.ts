import { Schema } from "effect";

/** Shallow TipTap/ProseMirror doc root. Nested nodes stay Unknown. */
export const TiptapDocSchema = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.optional(Schema.Array(Schema.Unknown)),
  attrs: Schema.optional(Schema.Unknown),
  marks: Schema.optional(Schema.Array(Schema.Unknown)),
  text: Schema.optional(Schema.String),
});
