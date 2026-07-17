import { Effect } from 'effect';

/**
 * Deploy config load errors: prettyUnknownFailure on cause string — not raw fiber dumps.
 *
 * @bad Generic message without unwrapping UnknownException / FiberFailure.
 * @bad Store raw Error or fiber object on `cause` (must be null | string).
 */
export const loadZerospinConfigFn = Effect.fn('loadZerospinConfigFn')(
  function* () {
    return yield* importConfigModule().pipe(
      Effect.catchAll(
        (base: unknown) =>
          new ZerospinError({
            code: 'deploy-invalid-config',
            message: 'Failed to load zerospin.config file.',
            cause: ZerospinError.prettyUnknownFailure(base),
          }),
      ),
    );
  },
);

declare function importConfigModule(): Effect.Effect<unknown, unknown, never>;
declare class ZerospinError {
  constructor(props: { code: string; message: string; cause?: string | null });
  static prettyUnknownFailure(error: unknown): string;
}
