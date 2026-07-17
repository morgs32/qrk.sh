import { Effect } from 'effect';

/**
 * catchAll/tapError callbacks return yieldable ZerospinError — not Effect.fail or one-step Effect.gen.
 *
 * @bad `Effect.fail(new ZerospinError(...))` in catchAll when ZerospinError is yieldable.
 * @bad One-step `Effect.gen(function* () { return yield* new ZerospinError(...) })` in catchAll.
 */
export const loadZerospinConfig = Effect.fn('loadZerospinConfig')(function* () {
  return yield* readConfigFile().pipe(
    Effect.catchAll(
      (error: unknown) =>
        new ZerospinError({
          code: 'deploy-invalid-config',
          message: 'Failed to load config.',
          cause: ZerospinError.prettyUnknownFailure(error),
        }),
    ),
  );
});

declare function readConfigFile(): Effect.Effect<unknown, unknown, never>;
declare class ZerospinError {
  constructor(props: { code: string; message: string; cause?: string | null });
  static prettyUnknownFailure(error: unknown): string;
}
