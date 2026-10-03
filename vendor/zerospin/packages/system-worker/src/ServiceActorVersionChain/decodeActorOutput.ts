import { ServiceActorOutputSchema } from '@zerospin/core/serviceSession/ServiceSessionWireSchema';
import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

export const decodeActorOutput = Effect.fn(
  'ServiceActorVersionChain.decodeActorOutput',
)(function* (
  row: typeof serviceActorVersionChainDbConfig.schema.browserCommands.$inferSelect,
) {
  const decoded = yield* serviceActorVersionChainDbConfig.tables.browserCommands
    .decodeRow(row)
    .pipe(
      mapParseError({
        code: 'session-output-invalid',
        prefix: 'Invalid retained output',
      }),
    );
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(ServiceActorOutputSchema),
  )({
    executedIndex: decoded.executedIndex,
    serviceHash: decoded.serviceHash,
    serviceIndex: decoded.serviceIndex,
    command: {
      id: decoded.id,
      commandName: decoded.commandName,
      delta: decoded.delta,
      failure: decoded.failure,
    },
  }).pipe(
    mapParseError({
      code: 'session-output-invalid',
      prefix: 'Invalid service browser command',
    }),
  );
});
