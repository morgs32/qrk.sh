import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; message?: string; cause?: unknown });
  static prettyUnknownFailure(cause: unknown): string;
}

declare function loadConfig(): Effect.Effect<{ entry: string }, unknown, never>;

/**
 * `catchAll` callbacks return the yieldable error directly — not `Effect.fail` or a one-step generator wrapper.
 *
 * @bad `Effect.catchAll(error => Effect.fail(new DomainError({ … })))`.
 * @bad `Effect.catchAll(error => Effect.gen(function* () { return yield* new DomainError({ … }) }))`.
 */
export const loadDeployConfig = loadConfig().pipe(
  Effect.catchAll(
    (error: unknown) =>
      new DomainError({
        code: 'deploy-invalid-config',
        message: 'Failed to load config.',
        cause: DomainError.prettyUnknownFailure(error),
      }),
  ),
);
