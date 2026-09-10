import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import { ServiceExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IAnyServiceFrontendBinding } from '@zerospin/core/frontendBinding/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IAnyService } from '@zerospin/core/service/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Schema } from 'effect';

import type { versionedServiceChainDbConfig } from '../../VersionedServiceChain/versionedServiceChainDbConfig.js';
import {
  FrontendVersionedServiceRepoDb,
  frontendVersionedServiceRepoDbConfig,
} from '../frontendVersionedServiceRepoDbConfig.js';
import { projectServiceFrontendResource } from '../projectServiceFrontendResource/projectServiceFrontendResource.js';

/** Replay a service result page and commit projected resources, output, and source progress together. */
export const executeTx = makeTx(
  'FrontendVersionedServiceRepo.executeTx',
  FrontendVersionedServiceRepoDb,
)(function* (props: {
  rows: readonly (typeof versionedServiceChainDbConfig.schema.commands.$inferSelect)[];
  service: IAnyService;
  frontend: IAnyServiceFrontendBinding;
  key: {
    systemId: string;
    serviceName: string;
    serviceVersion: string;
    userId: string;
    frontendName: string;
  };
}) {
  const { service, frontend, key } = props;

  const tx = yield* FrontendVersionedServiceRepoDb.Tx;
  const head = tx
    .select()
    .from(frontendVersionedServiceRepoDbConfig.schema.projectionState)
    .where(
      eq(frontendVersionedServiceRepoDbConfig.schema.projectionState.id, 1),
    )
    .get();
  let cursor = head?.serviceIndex ?? 0;
  let graph =
    head === undefined
      ? []
      : yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Array(EncodedResourceSchema)),
        )(head.graph).pipe(
          mapParseError({
            code: 'service-replica-graph-invalid',
            prefix: 'Invalid preceding service view',
          }),
        );
  for (const row of props.rows) {
    if (row.outboxIndex <= cursor) {
      if (
        row.outboxIndex === head?.serviceIndex &&
        row.entry !== head.canonicalBytes
      ) {
        return yield* new ZerospinError({
          code: 'service-replica-conflict',
          message: 'Repeated service result differs from the head',
        });
      }
      continue;
    }
    if (row.outboxIndex !== cursor + 1) {
      return yield* new ZerospinError({
        code: 'service-replica-gap',
        message: 'Service replay must be contiguous',
      });
    }
    const entry = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceExecutionEntrySchema),
    )(row.entry).pipe(
      mapParseError({
        code: 'service-replica-entry-invalid',
        prefix: 'Invalid terminal service entry',
      }),
    );
    const command = entry.command;
    if (
      row.executionVersion !== key.serviceVersion ||
      entry.preparationVersion !== key.serviceVersion ||
      command.serviceName !== key.serviceName ||
      command.serviceIndex !== row.outboxIndex ||
      command.dispositionHash === null ||
      command.delta === null
    ) {
      return yield* new ZerospinError({
        code: 'service-replica-target-mismatch',
        message: 'Terminal entry does not match the service replica',
      });
    }
    if (command.failedAt === null) {
      for (const mutation of entry.mutations) {
        const prepared = yield* prepareReplayAppliedMutation({
          mutation,
          controller: service,
        });
        if (prepared?.operationName === 'replicate') {
          return yield* new ZerospinError({
            code: 'service-replication-mutation-invalid',
            message: 'Service history cannot contain replication operations',
          });
        }
        if (prepared !== null) {
          yield* applyMutationTx({
            tx,
            mutation: prepared,
            commandId: command.id,
            mutationIndex: mutation.mutationIndex,
            appliedAt: entry.executionTimestamp,
          });
        }
      }
    }
    const nextGraph: IEncodedResourceShape[] = [];
    for (const model of Object.values(frontend.models)) {
      for (const row of tx.select().from(model.drizzleSchema).all()) {
        const projected = yield* projectServiceFrontendResource({
          ...key,
          modelName: model.modelName,
          resource: row,
        });
        const resource = yield* Schema.decodeUnknownEffect(
          EncodedResourceSchema,
        )(projected.resource).pipe(
          mapParseError({
            code: 'service-replica-projection-invalid',
            prefix: 'Invalid projected service resource',
          }),
        );
        nextGraph.push(resource);
      }
    }
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
      return yield* new ZerospinError({
        code: 'service-replica-projection-conflict',
        message: 'Projection contains duplicate resource identities',
      });
    }
    const inserted: IEncodedResourceShape[] = [],
      updated: IEncodedResourceShape[] = [];
    const deleted: Array<{ modelName: string; id: string }> = [];
    for (const [identity, resource] of after) {
      const previous = before.get(identity);
      if (!previous) {
        inserted.push(resource);
      } else if (
        JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(previous)) !==
        JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(resource))
      ) {
        updated.push(resource);
      }
    }
    for (const [identity, resource] of before) {
      if (!after.has(identity)) {
        deleted.push({ modelName: resource.modelName, id: resource.id });
      }
    }
    const output = yield* Schema.encodeEffect(
      Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
    )({
      ...command,
      serviceVersion: key.serviceVersion,
      delta: {
        inserted,
        updated,
        deleted,
        mutations: command.delta.mutations,
      },
    }).pipe(
      mapParseError({
        code: 'service-replica-output-invalid',
        prefix: 'Invalid per-position service output',
      }),
    );
    tx.insert(frontendVersionedServiceRepoDbConfig.schema.deltas)
      .values({
        outboxIndex: command.serviceIndex,
        output,
        deliveredAt: null,
        lastDeliveryFailure: null,
      })
      .run();
    const graphBytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(EncodedResourceSchema)),
    )(nextGraph).pipe(
      mapParseError({
        code: 'service-replica-graph-encode-failed',
        prefix: 'Invalid service graph',
      }),
    );
    tx.insert(frontendVersionedServiceRepoDbConfig.schema.projectionState)
      .values({
        id: 1,
        serviceIndex: command.serviceIndex,
        serviceVersion: key.serviceVersion,
        canonicalBytes: row.entry,
        graph: graphBytes,
      })
      .onConflictDoUpdate({
        target: frontendVersionedServiceRepoDbConfig.schema.projectionState.id,
        set: {
          serviceIndex: command.serviceIndex,
          serviceVersion: key.serviceVersion,
          canonicalBytes: row.entry,
          graph: graphBytes,
        },
      })
      .run();
    cursor = command.serviceIndex;
    graph = nextGraph;
  }
});
