import { Data } from "effect";

import type { IScrapeError } from "./types";

export class ScrapeError extends Data.TaggedError("ScrapeError")<IScrapeError> {}
