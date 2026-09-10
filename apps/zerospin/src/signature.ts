import { Schema } from "effect";

export const signature = Schema.Struct({
  sessionToken: Schema.String,
});
