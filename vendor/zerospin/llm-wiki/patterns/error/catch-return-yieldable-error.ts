import { Effect } from 'effect';

/**
 * Effect.catch callbacks return yieldable ZerospinError directly.
 *
 * @bad Wrap a yieldable ZerospinError in `Effect.fail` inside `Effect.catch`.
 * @bad Add a one-step `Effect.gen` solely to yield the error inside `Effect.catch`.
 */
export const loadZerospinConfig = Effect.fn('loadZerospinConfig')(function* () {
  return yield* readConfigFile().pipe(
    Effect.catch(
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
