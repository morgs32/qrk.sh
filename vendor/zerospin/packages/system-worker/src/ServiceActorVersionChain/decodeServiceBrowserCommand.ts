import { ServiceBrowserCommandSchema } from '@zerospin/core/serviceSession/ServiceSessionWireSchema';
import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

export const decodeServiceBrowserCommand = Effect.fn(
  'ServiceActorVersionChain.decodeServiceBrowserCommand',
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
    Schema.toType(ServiceBrowserCommandSchema),
  )({
    executedIndex: decoded.executedIndex,
    serviceHash: decoded.serviceHash,
    serviceIndex: decoded.serviceIndex,
    id: decoded.id,
    commandName: decoded.commandName,
    delta: decoded.delta,
    admission: decoded.admission,
    execution: decoded.execution,
  }).pipe(
    mapParseError({
      code: 'session-output-invalid',
      prefix: 'Invalid service browser command',
    }),
  );
});
