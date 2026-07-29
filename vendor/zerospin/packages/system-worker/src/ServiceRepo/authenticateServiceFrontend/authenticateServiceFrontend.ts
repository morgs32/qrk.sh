import type { IDb } from '@zerospin/core/drizzle/types';
import type { IActorId } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

/*
 * 1. Resolve the trusted service, actor, and frontend binding from this worker's
 *    compiled system rather than accepting executable behavior over RPC.
 * 2. Expose only Drizzle's typed query surface to the authentication callback.
 * 3. Return only the actor identity selected by the service-owned callback.
 */
export const authenticateServiceFrontend = Effect.fn(
  'ServiceRepo.authenticateServiceFrontend',
)(function* (props: {
  serviceName: string;
  actorName: string;
  frontendName: string;
  signature: unknown;
  db: IDb;
}): Effect.fn.Return<IActorId, IAnyError> {
  const { actorName, db, frontendName, serviceName, signature } = props;

  // 1 — every callback is re-resolved inside the trusted ServiceRepo runtime.
  const serviceController = yield* getByKeyOrThrow({
    record: system.serviceControllers,
    key: serviceName,
    recordKind: 'service controllers',
  });
  const actorController = yield* getByKeyOrThrow({
    record: serviceController.actorControllers,
    key: actorName,
    recordKind: `actor controllers owned by service ${serviceName}`,
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: actorController.frontends,
    key: frontendName,
    recordKind: `frontends owned by service actor ${serviceName}.${actorName}`,
  });

  if (typeof frontendBinding.authenticate !== 'function') {
    return yield* new ZerospinError({
      code: 'service-frontend-authenticator-not-configured',
      message: `Service frontend ${serviceName}.${actorName}.${frontendName} does not configure authentication`,
      extra: { serviceName, actorName, frontendName },
    });
  }

  // 2 — no raw client, transaction, SQL, mutation, or finalization capability
  // crosses this callback boundary. Build a fresh null-prototype registry so
  // runtime property lookup cannot reach service models outside the actor's
  // approved readable model set after TypeScript's types have been erased.
  const readableQuery: typeof db.query = Object.create(null);
  for (const modelName of Object.keys(actorController.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'service-frontend-readable-query-required',
        message: `Service frontend authentication cannot resolve readable model query "${modelName}"`,
        extra: { serviceName, actorName, frontendName, modelName },
      });
    }
    Reflect.set(readableQuery, modelName, modelQuery);
  }
  const queryOnlyDb = { query: readableQuery };

  // 3 — signature decoding is owned by SystemWorker before this RPC. The
  // callback's actor id is decoded again by SystemWorker before any repo name,
  // registration, or ticket is derived from it.
  return yield* frontendBinding.authenticate({
    signature,
    db: queryOnlyDb,
  });
});
