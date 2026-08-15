import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const authorizeServiceFrontend = Effect.fn(
  'ServiceRepo.authorizeServiceFrontend',
)(function* (props: {
  serviceName: string;
  frontendName: string;
  userId: string;
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'service-authorization-user-id-invalid',
      prefix: 'Failed to decode service authorization userId',
    }),
  );
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.serviceName,
    recordKind: 'services',
  });
  yield* getByKeyOrThrow({
    record: service.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by service ${props.serviceName}`,
  });
  if (typeof service.authorize !== 'function') {
    return yield* new ZerospinError({
      code: 'service-authorization-required',
      message: `Service ${props.serviceName} has a frontend but no authorizer`,
    });
  }

  const query = Object.create(null);
  for (const modelName of Object.keys(service.models)) {
    const modelQuery = Reflect.get(props.db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'service-authorization-readable-query-required',
        message: `Service authorization cannot resolve model query "${modelName}"`,
        extra: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
          modelName,
        },
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }

  yield* service.authorize({
    frontendName: props.frontendName,
    userId,
    db: { query },
  });
});
