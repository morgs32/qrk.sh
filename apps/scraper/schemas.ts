import { Schema } from "effect";

import type { ILinktreeScrapePayload } from "./types";

// Explicit rest schemas retain the complete provider JSON in Effect v4.
export const LinktreePayloadSchema = Schema.StructWithRest(
  Schema.Struct({
    props: Schema.StructWithRest(
      Schema.Struct({
        pageProps: Schema.StructWithRest(
          Schema.Struct({
            account: Schema.StructWithRest(Schema.Struct({ username: Schema.String }), [
              Schema.JsonObject,
            ]),
          }),
          [Schema.JsonObject],
        ),
      }),
      [Schema.JsonObject],
    ),
  }),
  [Schema.JsonObject],
) satisfies Schema.Schema<ILinktreeScrapePayload>;
