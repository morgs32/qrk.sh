import { Effect } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;
declare function getSystemWorker(props: {
  systemId: string;
  deployName: string;
}): Effect.Effect<{ getSystemSpec(): Promise<unknown> }, unknown>;

/**
 * Api code calls deployed worker RPCs — not internal worker package procedures.
 *
 * @bad Importing `ResourceRepo.getRepo()` from a worker internals path in an api gateway module.
 */
export const loadSystemSpec = Effect.fn('loadSystemSpec')(function* (props: {
  systemId: string;
  deployName: string;
}) {
  const { systemId, deployName } = props;
  const systemWorker = yield* getSystemWorker({ systemId, deployName });

  const systemSpec = yield* Effect.promise(() =>
    systemWorker.getSystemSpec(),
  ).pipe(Effect.flatMap(decodeRpc));

  return systemSpec;
});
