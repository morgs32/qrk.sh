import { Data } from "effect";

import type { IScrapeError } from "@qrk.sh/bricks/rpc/types";

export class ScrapeError extends Data.TaggedError("ScrapeError")<IScrapeError> {}
