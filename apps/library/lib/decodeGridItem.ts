import { Schema } from "effect";

const GridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

/** Decode a placement gridItem column (object or JSON string) for command payloads. */
export function decodeGridItem(value: unknown) {
  const raw: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return Schema.decodeUnknownSync(GridItemSchema)(raw);
}
