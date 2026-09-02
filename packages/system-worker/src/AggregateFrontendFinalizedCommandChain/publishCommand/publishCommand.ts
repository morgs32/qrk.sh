import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateFrontendFinalizedCommandChainDrizzleSchemas } from '../AggregateFrontendFinalizedCommandChainDbConfig.js';

export const publishCommand = Effect.fn(
  'AggregateFrontendFinalizedCommandChain.publishCommand',
)(function* (props: {
  command: IEncodedCommand<IAggregateFrontendFinalizedCommand>;
  db: IDb;
  key: {
    aggregateId: string;
    aggregateName: string;
  };
  broadcast(command: IEncodedCommand<IAggregateFrontendFinalizedCommand>): Promise<void>;
}) {
  const { command, db, key } = props;
  if (
    command.delta === null ||
    ('aggregateId' in command &&
      (command.aggregateId !== key.aggregateId ||
        command.aggregateName !== key.aggregateName))
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-finalized-command-invalid',
      message:
        'Aggregate frontend finalized command must be terminal and match its bound aggregate',
    });
  }
  const canonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'aggregate-frontend-finalized-command-encode-failed',
      prefix: `Failed to encode aggregate frontend command ${command.id}`,
    }),
  );

  const existingById = db
    .select()
    .from(aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .where(
      eq(
        aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands.commandId,
        command.id,
      ),
    )
    .get();
  const existingByIndex = db
    .select()
    .from(aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .where(
      eq(
        aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
          .frontendIndex,
        command.frontendIndex,
      ),
    )
    .get();
  const existing = existingById ?? existingByIndex;
  if (existing !== undefined) {
    if (
      existing.commandId !== command.id ||
      existing.frontendIndex !== command.frontendIndex ||
      existing.canonicalBytes !== canonicalBytes
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-finalized-command-conflict',
        message: `Aggregate frontend command ${command.id} conflicts with retained bytes`,
      });
    }
    yield* Effect.promise(() => props.broadcast(command));
    return;
  }

  const tip = db
    .select({
      frontendIndex:
        aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
          .frontendIndex,
    })
    .from(aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .orderBy(
      desc(
        aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
          .frontendIndex,
      ),
    )
    .limit(1)
    .get()?.frontendIndex;
  const expectedFrontendIndex = (tip ?? 0) + 1;
  if (command.frontendIndex !== expectedFrontendIndex) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-finalized-command-index-gap',
      message: `AggregateFrontendFinalizedCommandChain expected frontendIndex ${expectedFrontendIndex}, received ${command.frontendIndex}`,
    });
  }

  yield* Effect.try({
    try: () =>
      db
        .insert(aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands)
        .values({
          frontendIndex: command.frontendIndex,
          commandId: command.id,
          canonicalBytes,
          command: canonicalBytes,
        })
        .run(),
    catch: cause =>
      new ZerospinError({
        code: 'aggregate-frontend-finalized-command-persist-failed',
        message: `Failed to persist aggregate frontend command ${command.id}`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });
  yield* Effect.promise(() => props.broadcast(command));
});
