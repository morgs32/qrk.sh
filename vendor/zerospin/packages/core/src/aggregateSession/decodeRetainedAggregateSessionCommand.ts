import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { SessionCommandSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';

/** Complete local input is required for submission; terminal-only history cannot be pushed. */
export const decodeRetainedAggregateSessionCommand = Effect.fn(
  'decodeRetainedAggregateSessionCommand',
)(function* (row: typeof sessionRepoDbConfig.schema.commands.$inferSelect) {
  const command = yield* sessionRepoDbConfig.tables.commands
    .decodeRow(row)
    .pipe(
      mapParseError({
        code: 'session-command-invalid',
        prefix: 'Invalid retained command row',
      }),
    );
  return yield* Schema.decodeUnknownEffect(Schema.toType(SessionCommandSchema))(
    {
      id: command.id,
      commandName: command.commandName,
      payload: command.payload,
      contractVersion: command.contractVersion,
      aggregateId: command.aggregateId,
      aggregateName: command.aggregateName,
      actorName: command.actorName,
      actorVersion: command.actorVersion,
      sessionName: command.sessionName,
      claims: command.claims,
      sessionId: command.sessionId,
      sessionIndex: command.sessionIndex,
      pushIndex: command.admissionIndex,
      staging: command.staging,
    },
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'session-command-input-missing',
      prefix:
        'Retained command cannot be submitted without complete local input',
    }),
  );
});
