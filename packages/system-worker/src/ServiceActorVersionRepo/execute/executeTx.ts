import type { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { ServiceTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { prepareReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import type { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IAnyModels,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { IAnyService } from '@zerospin/core/service/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { decodeOwnedOperation } from '../../ownedOperations.js';
import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import { serviceVersionChainDbConfig } from '../../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { readServiceResources } from '../readServiceResources.js';
import { serviceActorVersionRepoDbConfig } from '../serviceActorVersionRepoDbConfig.js';

import type { IResolvedServiceResult } from './execute.js';
/** Replay a service result page and commit projected resources, output, and actor progress together. */
export const executeTx = makeTx('ServiceActorVersionRepo.executeTx')(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof serviceActorVersionRepoDbConfig.tables>
  >,
  props: {
    rows: readonly IResolvedServiceResult[];
    service: IAnyService;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      actorName: string;
      actorVersion: string;
    };
  },
) {
  const { service, key, rows } = props;
  const head = tx
    .select()
    .from(serviceActorVersionRepoDbConfig.schema.actorState)
    .where(eq(serviceActorVersionRepoDbConfig.schema.actorState.id, 1))
    .get();
  let cursor = head?.executedIndex ?? 0;
  let serviceHash = head?.serviceHash ?? genesisDispositionHash();
  let serviceIndex = head?.serviceIndex ?? 0;
  let graph = yield* readServiceResources(tx, service, key);
  for (const row of rows) {
    if (row.executedIndex <= cursor) {
      continue;
    }
    if (row.executedIndex !== cursor + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-projection-gap',
          message: 'Service replay must be contiguous',
        }),
      );
    }
    let caller: typeof ServiceCallerSchema.Type | null = null;
    let admission: typeof AdmissionResultSchema.Type | null = null;
    let execution: typeof ExecutionResultSchema.Type | null = null;

    {
      const { command: retained } = row;
      const command = yield* serviceVersionChainDbConfig.tables.commands
        .decodeRow(retained)
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.toType(ServiceTerminalCommandSchema),
            ),
          ),
          mapParseError({
            code: 'service-projection-command-invalid',
            prefix: 'Invalid terminal service executedCommand',
          }),
        );
      caller = command.caller;
      serviceIndex = command.serviceIndex;
      admission = command.admission;
      execution = command.execution;
      if (
        retained.executedIndex !== row.executedIndex ||
        retained.executionVersion !== key.serviceVersion ||
        command.serviceName !== key.serviceName ||
        command.dispositionHash === null
      ) {
        return yield* makeZerospinError('service-projection-target-mismatch');
      }
      if (command.execution.status === 'succeeded') {
        for (const [ordinal, operation] of row.operations.entries()) {
          if ('asyncContractName' in operation) {
            yield* serviceVersionChainDbConfig.tables.asyncOperations
              .decodeRow(operation)
              .pipe(
                mapParseError({
                  code: 'projection-async-invalid',
                  prefix: 'Invalid async output',
                }),
              );
            if (
              operation.commandId !== retained.id ||
              operation.serviceIndex !== retained.serviceIndex ||
              operation.operationIndex !== ordinal
            ) {
              return yield* makeZerospinError(
                'projection-async-association-invalid',
              );
            }
            continue;
          }
          yield* serviceVersionChainDbConfig.tables.modelOperations
            .decodeRow(operation)
            .pipe(
              mapParseError({
                code: 'service-projection-operation-invalid',
                prefix: 'Invalid retained service operation',
              }),
            );
          if (
            operation.serviceIndex !== retained.serviceIndex ||
            operation.commandId !== retained.id ||
            operation.operationIndex !== ordinal
          ) {
            return yield* makeZerospinError(
              'service-projection-operation-invalid',
            );
          }
          const captured = yield* decodeOwnedOperation(operation);
          const owned = service.models[captured.modelName];
          if (owned === undefined) {
            continue;
          }
          if (owned.version !== captured.modelVersion) {
            return yield* makeZerospinError(
              'service-projection-operation-invalid',
            );
          }
          const decoded = yield* prepareReplayAppliedOperation({
            operation: captured,
            controller: { models: service.models },
          });

          yield* applyOperationTx({
            tx,
            operation: decoded,
            commandId: retained.id,
            operationIndex: ordinal,
            appliedAt: operation.committedAt,
          });
        }
      } else if (row.operations.length > 0) {
        return yield* makeZerospinError('service-projection-operation-invalid');
      }
      tx.insert(serviceActorVersionRepoDbConfig.schema.commands)
        .values(retained)
        .run();
      for (const operation of row.operations) {
        if ('asyncContractName' in operation) {
          tx.insert(serviceActorVersionRepoDbConfig.schema.asyncOperations)
            .values(operation)
            .run();
        } else {
          tx.insert(serviceActorVersionRepoDbConfig.schema.modelOperations)
            .values(operation)
            .run();
        }
      }
      serviceHash = command.dispositionHash;
    }
    const nextGraph = yield* readServiceResources(tx, service, key);
    const before = new Map(
      graph.map(resource => [
        `${resource.modelName}\0${resource.id}`,
        resource,
      ]),
    );
    const after = new Map(
      nextGraph.map(resource => [
        `${resource.modelName}\0${resource.id}`,
        resource,
      ]),
    );
    if (after.size !== nextGraph.length) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-projection-projection-conflict',
          message: 'Projection contains duplicate resource identities',
        }),
      );
    }
    const inserted: IEncodedResourceShape[] = [],
      updated: IEncodedResourceShape[] = [];
    const deleted: Array<{
      modelName: string;
      id: string;
    }> = [];
    for (const [claims, resource] of after) {
      const previous = before.get(claims);
      if (!previous) {
        inserted.push(resource);
      } else if (
        JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(previous)) !==
        JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(resource))
      ) {
        updated.push(resource);
      }
    }
    for (const [claims, resource] of before) {
      if (!after.has(claims)) {
        deleted.push({ modelName: resource.modelName, id: resource.id });
      }
    }
    const output =
      yield* serviceActorVersionRepoDbConfig.tables.browserCommandOutbox
        .encodeRow({
          executedIndex: row.executedIndex,
          id: row.command.id,
          commandName: row.command.commandName,
          caller,
          serviceIndex,
          admission,
          execution,
          delta: {
            upserted: [...inserted, ...updated],
            deleted,
          },
          serviceHash,
          lastDeliveryFailure: null,
        })
        .pipe(
          mapParseError({
            code: 'service-projection-output-invalid',
            prefix: 'Invalid per-position service output',
          }),
        );
    tx.insert(serviceActorVersionRepoDbConfig.schema.browserCommandOutbox)
      .values(output)
      .run();
    tx.insert(serviceActorVersionRepoDbConfig.schema.actorState)
      .values({
        id: 1,
        executedIndex: row.executedIndex,
        serviceHash,
        serviceIndex,
        serviceVersion: key.serviceVersion,
      })
      .onConflictDoUpdate({
        target: serviceActorVersionRepoDbConfig.schema.actorState.id,
        set: {
          executedIndex: row.executedIndex,
          serviceHash,
          serviceIndex,
          serviceVersion: key.serviceVersion,
        },
      })
      .run();
    cursor = row.executedIndex;
    graph = nextGraph;
  }
});
