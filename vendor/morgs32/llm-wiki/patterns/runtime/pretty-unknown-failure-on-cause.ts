import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { cause?: unknown; code: string; message: string });
  static prettyUnknownFailure(cause: unknown): string;
}

/**
 * Store pretty-printed unknown failures on `cause` as a string — not raw fiber dumps via `JSON.stringify`.
 *
 * @bad Generic message with `JSON.stringify` on `UnknownException` / `FiberFailure` multi-hundred-line dumps.
 */
export const loadConfig = Effect.fn('loadConfig')(function* () {
  const base = yield* Effect.try({
    try: () => {
      throw new Error('config missing');
    },
    catch: (error: unknown) => error,
  }).pipe(
    Effect.catchAll(
      (base: unknown) =>
        new DomainError({
          code: 'deploy-invalid-config',
          message: 'Failed to load config file.',
          cause: DomainError.prettyUnknownFailure(base),
        }),
    ),
  );

  return base;
});
