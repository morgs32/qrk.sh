import { applyExecutionDeltaTx } from '@zerospin/core/contracts/applyExecutionDeltaTx';
import { ServiceExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
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

import { serviceVersionChainDbConfig } from '../../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { readServiceResources } from '../readServiceResources.js';
import { serviceActorVersionRepoDbConfig } from '../serviceActorVersionRepoDbConfig.js';

/** Replay a service result page and commit projected resources, output, and source progress together. */
export const executeTx = makeTx('ServiceActorVersionRepo.executeTx')(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof serviceActorVersionRepoDbConfig.tables>
  >,
  props: {
    rows: readonly (typeof serviceVersionChainDbConfig.schema.commands.$inferSelect)[];
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
  let cursor = head?.serviceIndex ?? 0;
  let graph = yield* readServiceResources(tx, service, key);
  for (const row of rows) {
    if (row.serviceIndex <= cursor) {
      continue;
    }
    if (row.serviceIndex !== cursor + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-replica-gap',
          message: 'Service replay must be contiguous',
        }),
      );
    }
    const command = yield* serviceVersionChainDbConfig.tables.commands
      .decodeRow(row)
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.toType(ServiceExecutedCommandSchema),
          ),
        ),
      )
      .pipe(
        mapParseError({
          code: 'service-replica-command-invalid',
          prefix: 'Invalid terminal service executedCommand',
        }),
      );
    if (
      row.executionVersion !== key.serviceVersion ||
      command.serviceName !== key.serviceName ||
      command.dispositionHash === null
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-replica-target-mismatch',
          message:
            'Terminal executedCommand does not match the service replica',
        }),
      );
    }
    if (command.execution.status === 'succeeded') {
      yield* applyExecutionDeltaTx({
        tx,
        models: service.models,
        executionDelta: command.execution.executionDelta,
      });
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
          code: 'service-replica-projection-conflict',
          message: 'Projection contains duplicate resource identities',
        }),
      );
    }
    const inserted: IEncodedResourceShape[] = [],
      updated: IEncodedResourceShape[] = [];
    const deleted: Array<{ modelName: string; id: string }> = [];
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
    const existing = tx
      .select()
      .from(serviceActorVersionRepoDbConfig.schema.commands)
      .where(eq(serviceActorVersionRepoDbConfig.schema.commands.id, command.id))
      .get();
    const output = yield* serviceActorVersionRepoDbConfig.tables.commands
      .encodeRow({
        rowId: existing?.rowId ?? `row_${crypto.randomUUID()}`,
        id: command.id,
        commandName: command.commandName,
        contractVersion: command.contractVersion,
        payload: row.payload,
        serviceName: command.serviceName,
        serviceVersion: command.serviceVersion,
        automationName: existing?.automationName ?? null,
        serviceIndex: command.serviceIndex,
        admission: command.admission,
        execution: command.execution,
        dispositionHash: command.dispositionHash,
        // The constructor-validated private binding has no browser publication.
        actorServiceIndex:
          key.actorName === '__service' ? null : command.serviceIndex,
        actorDelta: {
          upserted: [...inserted, ...updated],
          deleted,
        },
        serviceHash: command.dispositionHash,
        acknowledgedAt: null,
        lastDeliveryFailure: null,
      })
      .pipe(
        mapParseError({
          code: 'service-replica-output-invalid',
          prefix: 'Invalid per-position service output',
        }),
      );
    if (existing === undefined) {
      tx.insert(serviceActorVersionRepoDbConfig.schema.commands)
        .values(output)
        .run();
    } else {
      tx.update(serviceActorVersionRepoDbConfig.schema.commands)
        .set(output)
        .where(
          eq(
            serviceActorVersionRepoDbConfig.schema.commands.rowId,
            existing.rowId,
          ),
        )
        .run();
      tx.update(serviceActorVersionRepoDbConfig.schema.pendingCommands)
        .set({ resolvedAt: new Date() })
        .where(
          eq(
            serviceActorVersionRepoDbConfig.schema.pendingCommands.commandRowId,
            existing.rowId,
          ),
        )
        .run();
    }
    const registration = tx
      .select()
      .from(serviceActorVersionRepoDbConfig.schema.automationState)
      .where(eq(serviceActorVersionRepoDbConfig.schema.automationState.id, 1))
      .get();
    if (
      key.actorName === '__service' &&
      registration !== undefined &&
      command.serviceIndex > registration.startIndex &&
      command.serviceVersion === key.serviceVersion &&
      command.execution.status === 'succeeded' &&
      (inserted.length > 0 || updated.length > 0 || deleted.length > 0)
    ) {
      for (const automation of Object.values(service.automations)) {
        if (automation.on.commandName !== command.commandName) continue;
        let version = automation.on;
        while (
          version.version !== command.contractVersion &&
          version.previous !== undefined
        ) {
          version = version.previous;
        }
        if (version.version !== command.contractVersion) continue;
        tx.insert(serviceActorVersionRepoDbConfig.schema.automationGroups)
          .values({ serviceIndex: command.serviceIndex, status: 'open' })
          .onConflictDoNothing()
          .run();
        tx.insert(serviceActorVersionRepoDbConfig.schema.automationRuns)
          .values(
            yield* serviceActorVersionRepoDbConfig.tables.automationRuns.encodeRow(
              {
                serviceIndex: command.serviceIndex,
                automationName: automation.name,
                programStatus: 'pending',
                outputCommandRowId: null,
                programFailure: null,
                stagingFailure: null,
              },
            ),
          )
          .onConflictDoNothing()
          .run();
      }
    }
    tx.insert(serviceActorVersionRepoDbConfig.schema.actorState)
      .values({
        id: 1,
        serviceIndex: command.serviceIndex,
        serviceHash: command.dispositionHash,
        serviceVersion: key.serviceVersion,
      })
      .onConflictDoUpdate({
        target: serviceActorVersionRepoDbConfig.schema.actorState.id,
        set: {
          serviceIndex: command.serviceIndex,
          serviceHash: command.dispositionHash,
          serviceVersion: key.serviceVersion,
        },
      })
      .run();
    cursor = command.serviceIndex;
    graph = nextGraph;
  }
});
