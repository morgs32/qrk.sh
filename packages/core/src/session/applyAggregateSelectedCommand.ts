import { mapParseError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateSelectedCommandSchema } from './AggregateSelectedCommandSchema.ts';
import {
  applyAggregateSelectedCommandTx,
  Db,
} from './applyAggregateSelectedCommandTx.ts';
import type {
  IAggregateSelectedCommand,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

/*
 * 1. Validate the command kind, bound target, and terminal status.
 * 2. Encode canonical journal bytes and validate every delta resource.
 * 3. Enforce duplicate and contiguous frontier rules in one transaction.
 * 4. Rewind active optimism before authoritative or failed input.
 * 5. Apply selected state or record the next pushed occurrence.
 * 6. Replay surviving optimistic mutations over the new base.
 * 7. Advance only the frontiers owned by this command kind.
 * 8. Report the committed application result.
 */
export const applyAggregateSelectedCommand = Effect.fn(
  'applyAggregateSelectedCommand',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  models: InferFrontendModels<FRONTEND>;
  command: IAggregateSelectedCommand;
  sessionId: ISessionId;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  // 1 — Encode against the selected-command wire schema.
  const { command, db, models, sessionId } = props;

  yield* Schema.encodeUnknownEffect(AggregateSelectedCommandSchema)(
    command,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-command-invalid',
      prefix: 'Invalid frontend output',
    }),
  );
  const delta = command.delta;
  // 2 — Preserve the complete occurrence as canonical journal JSON and decode
  // every upserted and deleted resource against its frontend model.
  const resourceRows = delta.upserted;
  for (const resource of resourceRows) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-command-resource-invalid',
        prefix: `Failed to decode frontend resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }
  for (const removedRef of delta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: removedRef.modelName,
      recordKind: 'frontend models',
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
        code: 'aggregate-frontend-command-ref-invalid',
        prefix: `Failed to decode deleted frontend ref ${removedRef.modelName}.${removedRef.id}`,
      }),
    );
  }

  return yield* applyAggregateSelectedCommandTx({
    sessionId,
    command,
    models,
    resourceRows,
    delta,
  }).pipe(Effect.provideService(Db, db));
});
