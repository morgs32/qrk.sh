import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import type { IRpcEither } from "./types";
import type { ScrapeError } from "./ScrapeError";

export const encodeRpc = <RIGHT>(program: Effect.Effect<RIGHT, ScrapeError>) =>
  program.pipe(
    Effect.result,
    Effect.map(
      Result.match({
        onFailure: (error) => ({
          _tag: "Left" as const,
          left: { code: error.code, message: error.message },
        }),
        onSuccess: (right) => ({ _tag: "Right" as const, right }),
      }),
    ),
  ) satisfies Effect.Effect<IRpcEither<RIGHT>>;
