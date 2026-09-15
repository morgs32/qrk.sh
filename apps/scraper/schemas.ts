import { Schema } from "effect";

import type { ILinktreeScrapePayload } from "./types";

export const LinktreePayloadSchema = Schema.Struct({
  props: Schema.Struct({
    pageProps: Schema.Struct({
      account: Schema.Struct({ username: Schema.String }),
    }),
  }),
}) satisfies Schema.Schema<ILinktreeScrapePayload>;
