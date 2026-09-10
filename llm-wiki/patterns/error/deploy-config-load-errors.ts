import { Effect } from 'effect';

/**
 * TypeScript config load errors: format unknown Promise rejections as cause text.
 *
 * @bad Assume a Promise rejection is always an Error instance.
 * @bad Store a raw rejection value on `cause` (must be null | string).
 */
export const loadZerospinConfigFn = Effect.fn('loadZerospinConfigFn')(
  function* () {
    return yield* importProjectConfig().pipe(
      Effect.catch(
        (base: unknown) =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: 'Failed to load zerospin.config.ts.',
            cause: ZerospinError.prettyUnknownFailure(base),
          }),
      ),
    );
  },
);

declare function importProjectConfig(): Effect.Effect<unknown, unknown, never>;
declare class ZerospinError {
  constructor(props: { code: string; message: string; cause?: string | null });
  static prettyUnknownFailure(error: unknown): string;
}
