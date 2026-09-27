import { mapParseError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { ISessionId } from '../../aggregateSession/types.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';
import { ServiceActorCommandSchema } from '../ServiceActorCommandSchema.ts';
import type {
  IServiceActorCommand,
  IServiceSessionDefinition,
  IServiceSessionDrizzleDb,
} from '../types.ts';

import { applyServiceActorCommandTx } from './applyServiceActorCommandTx/applyServiceActorCommandTx.ts';

/*
 * 1. Reject a wrong target or non-contiguous definition index before mutation.
 * 2. Prove every resource/ref belongs to a declared projection model.
 * 3. Commit the complete resource actorDelta in one SQLite transaction.
 */
export const applyServiceActorCommand = Effect.fn('applyServiceActorCommand')(
  function* <DEFINITION extends IServiceSessionDefinition>(props: {
    definition: DEFINITION;
    sessionId: ISessionId;
    db: IServiceSessionDrizzleDb<DEFINITION['models'], Record<never, never>>;
    models: DEFINITION['models'];
    command: IServiceActorCommand;
  }): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
    const { command, db, models, sessionId } = props;

    yield* Schema.encodeUnknownEffect(ServiceActorCommandSchema)(command).pipe(
      mapParseError({
        code: 'service-session-command-encode-failed',
        prefix: 'Failed to encode service definition command',
      }),
    );

    const actorDelta = command.actorDelta;

    const resourceRows = actorDelta.upserted;

    for (const resource of resourceRows) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'service definition models',
      });
      yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-session-command-resource-invalid',
          prefix: `Failed to decode service definition command resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }
    for (const deletedRef of actorDelta.deleted) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: deletedRef.modelName,
        recordKind: 'service definition models',
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
          code: 'service-session-command-ref-invalid',
          prefix: `Failed to decode deleted service definition command ref ${deletedRef.modelName}.${deletedRef.id}`,
        }),
      );
    }

    return yield* applyServiceActorCommandTx(db, {
      sessionId,
      command,
      resourceRows,
      models,
      actorDelta,
    });
  },
);
