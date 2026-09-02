import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { Semaphore } from 'effect/Semaphore';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { MaterializedServiceRepo } from '../../MaterializedServiceRepo/MaterializedServiceRepo.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';
import { serviceCommandChainDrizzleSchemas } from '../ServiceCommandChainDbConfig.js';

export const finalizeServiceCommand = Effect.fn(
  'ServiceCommandChain.finalizeServiceCommand',
)(function* (props: {
  admissionSemaphore: Semaphore;
  aggregateCommandChains: Cloudflare.Env['AGGREGATE_COMMAND_CHAIN'];
  command: IEncodedCommand<IServiceCommand>;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: { systemId: string; serviceName: string };
  materializedServiceFrontendRepos: Cloudflare.Env['MATERIALIZED_SERVICE_FRONTEND_REPO'];
  materializedServiceRepos: Cloudflare.Env['MATERIALIZED_SERVICE_REPO'];
  storage: DurableObjectStorage;
}) {
  const { command, db, key } = props;
  if (command.serviceName !== key.serviceName) {
    return yield* new ZerospinError({
      code: 'service-command-chain-target-mismatch',
      message: 'Service command does not match its bound ServiceCommandChain',
    });
  }
  const halted = db
    .select()
    .from(serviceCommandChainDrizzleSchemas.chainState)
    .where(eq(serviceCommandChainDrizzleSchemas.chainState.id, 1))
    .get();
  if (halted?.haltedAt !== null && halted?.haltedAt !== undefined) {
    return yield* new ZerospinError({
      code: 'service-command-chain-halted',
      message: 'ServiceCommandChain is halted for execution repair',
      ...(halted.failure === null ? {} : { cause: halted.failure }),
    });
  }

  const canonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(EncodedServiceCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'service-command-chain-command-encode-failed',
      prefix: `Failed to encode service command ${command.id}`,
    }),
  );
  const row = yield* props.admissionSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const retained = db
        .select()
        .from(serviceCommandChainDrizzleSchemas.commands)
        .where(
          eq(serviceCommandChainDrizzleSchemas.commands.commandId, command.id),
        )
        .get();
      if (retained !== undefined) {
        if (retained.canonicalBytes !== canonicalBytes) {
          return yield* new ZerospinError({
            code: 'service-command-chain-command-conflict',
            message: `Service command ${command.id} differs from its retained bytes`,
          });
        }
        return retained;
      }

      const materializedServiceRepoName =
        yield* MaterializedServiceRepo.fixedDORepoConfig.nameUtils.makeName(
          key,
        );
      const chainedAt = new Date();
      yield* Effect.try({
        try: () =>
          db.transaction(tx => {
            const concurrent = tx
              .select()
              .from(serviceCommandChainDrizzleSchemas.commands)
              .where(
                eq(
                  serviceCommandChainDrizzleSchemas.commands.commandId,
                  command.id,
                ),
              )
              .get();
            if (concurrent !== undefined) {
              if (concurrent.canonicalBytes !== canonicalBytes) {
                throw new ZerospinError({
                  code: 'service-command-chain-command-conflict',
                  message: `Service command ${command.id} differs from its retained bytes`,
                });
              }
              return;
            }
            const previous = tx
              .select({
                serviceIndex:
                  serviceCommandChainDrizzleSchemas.commands.serviceIndex,
              })
              .from(serviceCommandChainDrizzleSchemas.commands)
              .orderBy(
                desc(serviceCommandChainDrizzleSchemas.commands.serviceIndex),
              )
              .limit(1)
              .get();
            tx.insert(serviceCommandChainDrizzleSchemas.commands)
              .values({
                serviceIndex: (previous?.serviceIndex ?? 0) + 1,
                commandId: command.id,
                canonicalBytes,
                chainedAt,
                command: canonicalBytes,
                result: null,
                materializedServiceRepoName,
              })
              .run();
          }),
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'service-command-chain-admission-failed',
                message: `Failed to admit service command ${command.id}`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      });
      return db
        .select()
        .from(serviceCommandChainDrizzleSchemas.commands)
        .where(
          eq(serviceCommandChainDrizzleSchemas.commands.commandId, command.id),
        )
        .get();
    }),
  );
  if (row === undefined) {
    return yield* new ZerospinError({
      code: 'service-command-chain-admission-missing',
      message: `Service command ${command.id} was not retained after admission`,
    });
  }

  yield* Effect.promise(() => props.storage.setAlarm(Date.now()));
  yield* runScheduledWork({
    aggregateCommandChains: props.aggregateCommandChains,
    db,
    deliveryQueue: props.deliveryQueue,
    materializedServiceFrontendRepos: props.materializedServiceFrontendRepos,
    materializedServiceRepos: props.materializedServiceRepos,
    storage: props.storage,
  });

  const settled = db
    .select()
    .from(serviceCommandChainDrizzleSchemas.commands)
    .where(eq(serviceCommandChainDrizzleSchemas.commands.commandId, command.id))
    .get();
  if (settled?.result !== null && settled?.result !== undefined) {
    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceChainedCommandSchema),
    )(settled.result).pipe(
      mapParseError({
        code: 'service-command-chain-retained-result-invalid',
        prefix: `Failed to decode service command result ${command.id}`,
      }),
    );
  }
  return yield* new ZerospinError({
    code: 'service-command-chain-terminal-result-missing',
    message: `Service command ${command.id} remains pending after scheduled execution`,
  });
});
