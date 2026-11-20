import * as Schema from "effect/Schema";

export const signature = Schema.Struct({
  sessionToken: Schema.String,
});
