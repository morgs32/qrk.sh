import * as Data from "effect/Data";

import type { IScrapeError } from "@qrk.sh/bricks/rpc/types";

export class ScrapeError extends Data.TaggedError("ScrapeError")<IScrapeError> {}
