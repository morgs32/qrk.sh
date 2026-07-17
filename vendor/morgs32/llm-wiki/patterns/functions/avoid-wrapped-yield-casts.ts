import { Effect } from 'effect';

declare function decodeRpc<A>(
  encoded: unknown,
): Effect.Effect<A, unknown, never>;
declare function loadEncodedRows(): Effect.Effect<unknown, never, never>;

/**
 * Assign yield* results to locals; cast on the next line, not wrapped in return.
 *
 * @bad `return (yield* Effect.promise(...).pipe(...)) as RESULT`.
 */
export const loadDecodedRows = Effect.fn('loadDecodedRows')(function* <
  RESULT,
>() {
  const encoded = yield* loadEncodedRows();
  const result = yield* Effect.promise(() => Promise.resolve(encoded)).pipe(
    Effect.flatMap(decodeRpc),
  );
  return result as RESULT;
});

/**
 * @bad `const { href: systemFileUrl } = yield* pathApi.toFileUrl(systemPath)` — destructure yield* results.
 */
export const resolveFileUrl = Effect.fn('resolveFileUrl')(function* () {
  const pathApi = { toFileUrl: (p: string) => Effect.succeed({ href: p }) };
  const systemPath = '/data';
  const fileUrl = yield* pathApi.toFileUrl(systemPath);
  const { href: systemFileUrl } = fileUrl;
  return systemFileUrl;
});

declare namespace Effect {
  function succeed<A>(a: A): Effect.Effect<A, never, never>;
}
