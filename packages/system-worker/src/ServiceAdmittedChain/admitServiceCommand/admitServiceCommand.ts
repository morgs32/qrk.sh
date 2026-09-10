import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceAdmittedChainDbConfig } from '../serviceAdmittedChainDbConfig.js';

export const admitServiceCommand = Effect.fn(
  'ServiceAdmittedChain.admitServiceCommand',
)(function* (props: {
  command: IEncodedCommand<IServiceCommand>;
  db: IDb;
  key: { systemId: string; serviceName: string };
}) {
  const { command, db, key } = props;
  if (command.serviceName !== key.serviceName) {
    return yield* new ZerospinError({
      code: 'service-admission-target-mismatch',
      message: 'Command does not match its service',
    });
  }
  const bytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(EncodedServiceCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'service-admission-encode-failed',
      prefix: 'Invalid service input',
    }),
  );
  const index = yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        const retained = tx
          .select()
          .from(serviceAdmittedChainDbConfig.schema.commands)
          .where(
            eq(
              serviceAdmittedChainDbConfig.schema.commands.commandId,
              command.id,
            ),
          )
          .get();
        if (retained) {
          if (retained.canonicalBytes !== bytes) {
            throw new ZerospinError({
              code: 'service-admission-conflict',
              message: 'Command differs from retained input',
            });
          }
          return retained.fanoutIndex;
        }
        const index =
          (tx
            .select()
            .from(serviceAdmittedChainDbConfig.schema.commands)
            .orderBy(
              desc(serviceAdmittedChainDbConfig.schema.commands.fanoutIndex),
            )
            .limit(1)
            .get()?.fanoutIndex ?? 0) + 1;
        tx.insert(serviceAdmittedChainDbConfig.schema.commands)
          .values({
            fanoutIndex: index,
            commandId: command.id,
            canonicalBytes: bytes,
            command: bytes,
            chainedAt: new Date(),
          })
          .run();
        return index;
      }),
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'service-admission-failed',
            message: 'Failed to admit service input',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
  return { commandId: command.id, serviceIndex: index };
});
