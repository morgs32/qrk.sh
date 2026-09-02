import { Effect } from 'effect';

/**
 * JSONC config load errors: format unknown Promise rejections as cause text.
 *
 * @bad Assume a Promise rejection is always an Error instance.
 * @bad Store a raw rejection value on `cause` (must be null | string).
 */
export const loadZerospinConfigFn = Effect.fn('loadZerospinConfigFn')(
  function* () {
    return yield* parseJsoncConfig().pipe(
      Effect.catch(
        (base: unknown) =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: 'Failed to load zerospin.jsonc.',
            cause: ZerospinError.prettyUnknownFailure(base),
          }),
      ),
    );
  },
);

declare function parseJsoncConfig(): Effect.Effect<unknown, unknown, never>;
declare class ZerospinError {
  constructor(props: { code: string; message: string; cause?: string | null });
  static prettyUnknownFailure(error: unknown): string;
}
