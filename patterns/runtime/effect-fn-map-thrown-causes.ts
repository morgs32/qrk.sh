import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; message?: string; cause?: unknown });
  static prettyUnknownFailure(cause: unknown): string;
}

declare function decodeJwt(token: string): { userId: string };
declare function validateModelId(props: {
  model: unknown;
  id: string;
}): Effect.Effect<string | null, DomainError>;

/**
 * Map thrown causes to typed errors; translate only specific expected failures to values.
 *
 * @bad `Effect.try({ catch: () => null }).pipe(Effect.catchAll(() => Effect.succeed(null)))` swallowing decode failures.
 */
export const resolveUserClaim = Effect.fn('resolveUserClaim')(
  function* (props: {
    accessToken: string;
    system: { models: { user: unknown } };
  }) {
    const { accessToken, system } = props;

    const jwt = yield* Effect.try({
      try: () => decodeJwt(accessToken),
      catch: cause =>
        new DomainError({
          cause: DomainError.prettyUnknownFailure(cause),
          code: 'decode-access-token-failed',
          message: 'Failed to decode access token.',
        }),
    });

    return yield* validateModelId({
      model: system.models.user,
      id: jwt.userId,
    }).pipe(
      Effect.catchIf(
        error =>
          error instanceof DomainError && error.code === 'invalid-model-id',
        () => Effect.succeed(null),
      ),
    );
  },
);
