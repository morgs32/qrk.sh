import * as Data from "effect/Data";

import type { IScrapeError } from "./types";

export class ScrapeError extends Data.TaggedError("ScrapeError")<IScrapeError> {}
