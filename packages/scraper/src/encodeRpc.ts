import { Effect, Either } from "effect";

import type { IRpcEither } from "./types";
import type { ScrapeError } from "./ScrapeError";

export const encodeRpc = <RIGHT>(program: Effect.Effect<RIGHT, ScrapeError>) =>
  program.pipe(
    Effect.either,
    Effect.map(
      Either.match({
        onLeft: error => ({
          _tag: "Left" as const,
          left: { code: error.code, message: error.message },
        }),
        onRight: right => ({ _tag: "Right" as const, right }),
      }),
    ),
  ) satisfies Effect.Effect<IRpcEither<RIGHT>>;
