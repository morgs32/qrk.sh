import { mapParseError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IDrizzleRelationsFromModels } from '../../drizzle/types.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';
import { AggregateActorCommandSchema } from '../AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type {
  IAggregateActorCommand,
  IAggregateSessionDefinition,
  ISessionDrizzleDb,
  ISessionId,
} from '../types.ts';

import { applyAggregateActorCommandTx } from './applyAggregateActorCommandTx/applyAggregateActorCommandTx.ts';

/*
 * 1. Validate the command kind, bound target, and terminal status.
 * 2. Encode canonical journal bytes and validate every actorDelta resource.
 * 3. Enforce duplicate and contiguous frontier rules in one transaction.
 * 4. Rewind active optimism before authoritative or failed input.
 * 5. Apply selected state or record the next pushed occurrence.
 * 6. Derive fresh mutations from surviving pending commands over the new base.
 * 7. Advance only the frontiers owned by this command kind.
 * 8. Report the committed application result.
 */
export const applyAggregateActorCommand = Effect.fn(
  'applyAggregateActorCommand',
)(function* <DEFINITION extends IAggregateSessionDefinition>(props: {
  db: ISessionDrizzleDb<
    DEFINITION['models'],
    IDrizzleRelationsFromModels<DEFINITION['models']>
  >;
  definition: DEFINITION;
  models: DEFINITION['models'];
  command: IAggregateActorCommand;
  sessionId: ISessionId;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  // 1 — Encode against the actor-command wire schema.
  const { command, db, models, sessionId, definition } = props;

  yield* Schema.encodeUnknownEffect(AggregateActorCommandSchema)(command).pipe(
    mapParseError({
      code: 'aggregate-session-command-invalid',
      prefix: 'Invalid definition output',
    }),
  );
  // Validate the authoritative envelope; recognition is not a reconciliation gate.
  const actorDelta = command.actorDelta;
  // 2 — Preserve the complete occurrence as canonical journal JSON and decode
  // every upserted and deleted resource against its definition model.
  const resourceRows = actorDelta.upserted;
  for (const resource of resourceRows) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'definition models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-session-command-resource-invalid',
        prefix: `Failed to decode definition resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }
  for (const removedRef of actorDelta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: removedRef.modelName,
      recordKind: 'definition models',
    });
    yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          id: makeAbbreviationIdSchema(model.abbreviation),
          modelName: Schema.Literal(model.modelName),
        }),
      ),
    )(removedRef, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-session-command-ref-invalid',
        prefix: `Failed to decode deleted definition ref ${removedRef.modelName}.${removedRef.id}`,
      }),
    );
  }

  return yield* applyAggregateActorCommandTx(db, {
    sessionId,
    definition,
    command,
    models,
    resourceRows,
    actorDelta,
  });
});
