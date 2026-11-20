import { ClerkOfflineError } from "@clerk/react/errors";
import { prettyUnknownFailure, ZerospinError } from "@zerospin/error";
import * as Effect from "effect/Effect";

export const getClerkToken = Effect.fn("getClerkToken")(function* (props: {
  getToken: () => Promise<string | null>;
}) {
  const { getToken } = props;
  return yield* Effect.promise(() => getToken()).pipe(
    Effect.catchDefect((cause) => {
      if (!ClerkOfflineError.is(cause)) return Effect.die(cause);
      return new ZerospinError({
        code: "clerk-offline-error",
        message: "Clerk is offline",
        cause: prettyUnknownFailure(cause),
      });
    }),
  );
});
