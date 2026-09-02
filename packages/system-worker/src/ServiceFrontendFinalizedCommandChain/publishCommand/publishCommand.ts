import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceFrontendFinalizedCommandChainDrizzleSchemas } from '../ServiceFrontendFinalizedCommandChainDbConfig.js';

export const publishCommand = Effect.fn(
  'ServiceFrontendFinalizedCommandChain.publishCommand',
)(function* (props: {
  command: IEncodedCommand<IServiceFrontendFinalizedCommand>;
  db: IDb;
  key: { serviceName: string };
  broadcast(command: IEncodedCommand<IServiceFrontendFinalizedCommand>): Promise<void>;
}) {
  const { command, db, key } = props;
  if (command.delta === null || command.serviceName !== key.serviceName) {
    return yield* new ZerospinError({
      code: 'service-frontend-finalized-command-invalid',
      message:
        'Service frontend finalized command must be terminal and match its bound service',
    });
  }
  const canonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'service-frontend-finalized-command-encode-failed',
      prefix: `Failed to encode service frontend command ${command.id}`,
    }),
  );
  const existingById = db
    .select()
    .from(serviceFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .where(
      eq(
        serviceFrontendFinalizedCommandChainDrizzleSchemas.commands.commandId,
        command.id,
      ),
    )
    .get();
  const existingByIndex = db
    .select()
    .from(serviceFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .where(
      eq(
        serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
          .serviceFrontendIndex,
        command.serviceFrontendIndex,
      ),
    )
    .get();
  const existing = existingById ?? existingByIndex;
  if (existing !== undefined) {
    if (
      existing.commandId !== command.id ||
      existing.serviceFrontendIndex !== command.serviceFrontendIndex ||
      existing.canonicalBytes !== canonicalBytes
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-finalized-command-conflict',
        message: `Service frontend command ${command.id} conflicts with retained bytes`,
      });
    }
    yield* Effect.promise(() => props.broadcast(command));
    return;
  }
  const tip = db
    .select({
      serviceFrontendIndex:
        serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
          .serviceFrontendIndex,
    })
    .from(serviceFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .orderBy(
      desc(
        serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
          .serviceFrontendIndex,
      ),
    )
    .limit(1)
    .get()?.serviceFrontendIndex;
  const expectedServiceFrontendIndex = (tip ?? 0) + 1;
  if (command.serviceFrontendIndex !== expectedServiceFrontendIndex) {
    return yield* new ZerospinError({
      code: 'service-frontend-finalized-command-index-gap',
      message: `ServiceFrontendFinalizedCommandChain expected serviceFrontendIndex ${expectedServiceFrontendIndex}, received ${command.serviceFrontendIndex}`,
    });
  }
  yield* Effect.try({
    try: () =>
      db
        .insert(serviceFrontendFinalizedCommandChainDrizzleSchemas.commands)
        .values({
          serviceFrontendIndex: command.serviceFrontendIndex,
          commandId: command.id,
          canonicalBytes,
          command: canonicalBytes,
        })
        .run(),
    catch: cause =>
      new ZerospinError({
        code: 'service-frontend-finalized-command-persist-failed',
        message: `Failed to persist service frontend command ${command.id}`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });
  yield* Effect.promise(() => props.broadcast(command));
});
