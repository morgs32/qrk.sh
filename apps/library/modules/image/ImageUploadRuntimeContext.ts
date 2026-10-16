import { createContext } from "react";
import type { Effect } from "effect";

import type { ImageUploadEnvironment } from "./ImageUploadEnvironment";

export const ImageUploadRuntimeContext = createContext<{
  runPromise: <A, E>(
    program: Effect.Effect<A, E, ImageUploadEnvironment>,
    options?: Effect.RunOptions,
  ) => Promise<A>;
} | null>(null);
