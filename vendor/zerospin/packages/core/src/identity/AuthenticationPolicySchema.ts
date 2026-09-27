import { Schema } from 'effect';

/** Missing policy is invalid; direct claims admission must be explicit. */
export const AuthenticationPolicySchema = Schema.Union([
  Schema.Literal('none'),
  Schema.Struct({
    credentialsSchema: Schema.declare(
      (value: unknown): value is Schema.Codec<unknown, unknown> =>
        Schema.isSchema(value),
    ),
    authenticate: Schema.declare(
      (value: unknown): value is (...args: never[]) => unknown =>
        typeof value === 'function',
    ),
  }),
]);
