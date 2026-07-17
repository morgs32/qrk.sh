import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; message?: string });
  pipe(...ops: unknown[]): unknown;
}

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, DomainError>;
declare function encodeRpc(effect: unknown): Promise<unknown>;
declare function getSystemWorker(props: {
  systemId: string;
  deployName: string;
}): Effect.Effect<
  { fetchActor(props: { actorId: string }): Promise<unknown> },
  DomainError
>;

/**
 * Domain failures belong on the Effect failure channel (`return yield*`), not the success channel.
 *
 * @bad `return new DomainError({ code: 'id-mismatch' })` as a success value inside `Effect.gen`.
 * @bad `.pipe(Effect.catchAll(error => Effect.succeed(encodeLeft(error))))` instead of `encodeRpc` on typed failures.
 */
export const fetchActor = (props: {
  systemId: string;
  deployName: string;
  actorId: string;
  resolvedSystemId: string;
}) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { systemId, deployName, actorId, resolvedSystemId } = props;

      if (resolvedSystemId !== systemId) {
        return yield* new DomainError({ code: 'system-worker-id-mismatch' });
      }

      const systemWorker = yield* getSystemWorker({ systemId, deployName });

      return yield* Effect.promise(() =>
        systemWorker.fetchActor({ actorId }),
      ).pipe(Effect.flatMap(decodeRpc));
    }).pipe(encodeRpc),
  );
