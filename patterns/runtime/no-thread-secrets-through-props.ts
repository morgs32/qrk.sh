import { Context, Effect } from 'effect';

declare class ApisUrl extends Context.Tag('ApisUrl')<ApisUrl, string>() {}
declare class RedactedSecretKey extends Context.Tag('RedactedSecretKey')<
  RedactedSecretKey,
  string
>() {}

declare function executeSelectQuery(props: {
  query: unknown;
}): Effect.Effect<readonly unknown[], unknown, never>;

/**
 * Read API URL and secrets from Context tags — do not thread them through every call.
 *
 * @bad `executeSelectQuery({ apiUrl, secretKey, query })` at every call site.
 */
export const runSelectQuery = Effect.fn('runSelectQuery')(function* (props: {
  query: unknown;
}) {
  const { query } = props;
  const apiUrl = yield* ApisUrl;
  const redactedSecretKey = yield* RedactedSecretKey;

  return yield* executeSelectQuery({ query }).pipe(
    Effect.provideService(ApisUrl, apiUrl),
    Effect.provideService(RedactedSecretKey, redactedSecretKey),
  );
});
