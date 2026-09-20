import { mapParseError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IServiceFrontendController } from '../frontendController/types.ts';
import type { ISessionId } from '../session/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  applyServiceSelectedCommandTx,
  Db,
} from './applyServiceSelectedCommandTx.ts';
import { ServiceSelectedCommandSchema } from './ServiceSelectedCommandSchema.ts';
import type {
  IServiceSelectedCommand,
  IServiceSessionDrizzleDb,
} from './types.ts';

/*
 * 1. Reject a wrong target or non-contiguous frontend index before mutation.
 * 2. Prove every resource/ref belongs to a declared projection model.
 * 3. Commit the complete resource delta in one SQLite transaction.
 */
export const applyServiceSelectedCommand = Effect.fn(
  'applyServiceSelectedCommand',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  frontend: FRONTEND;
  sessionId: ISessionId;
  db: IServiceSessionDrizzleDb<FRONTEND['models'], Record<never, never>>;
  models: FRONTEND['models'];
  command: IServiceSelectedCommand;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  const { command, db, models, sessionId } = props;

  yield* Schema.encodeUnknownEffect(ServiceSelectedCommandSchema)(
    command,
  ).pipe(
    mapParseError({
      code: 'service-frontend-command-encode-failed',
      prefix: 'Failed to encode service frontend command',
    }),
  );

  const delta = command.delta;

  const resourceRows = delta.upserted;

  for (const resource of resourceRows) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'service frontend models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'service-frontend-command-resource-invalid',
        prefix: `Failed to decode service frontend command resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }
  for (const deletedRef of delta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: deletedRef.modelName,
      recordKind: 'service frontend models',
    });
    yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          id: makeAbbreviationIdSchema(model.abbreviation),
          modelName: Schema.Literal(model.modelName),
        }),
      ),
    )(deletedRef, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'service-frontend-command-ref-invalid',
        prefix: `Failed to decode deleted service frontend command ref ${deletedRef.modelName}.${deletedRef.id}`,
      }),
    );
  }

  return yield* applyServiceSelectedCommandTx({
    sessionId,
    command,
    resourceRows,
    models,
    delta,
  }).pipe(Effect.provideService(Db, db));
});
