/*
 * System-worker annotation:
 * Defines the ServiceRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  EncodedExecutedServiceCommandSchema,
  EncodedFailedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedCommand,
  IExecutedServiceCommand,
  IFailedServiceCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAnyTables,
  IEncodedResourceShape,
  IServiceCursorId,
  IShape,
} from '@zerospin/core/models/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import {
  ServiceBlockSchema,
  ServiceFinalizationReceiptSchema,
} from '../blockSchemas.js';
import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IServiceBlock } from '../types.js';

import { alarm } from './alarm/alarm.js';
import { authorizeServiceFrontend } from './authorizeServiceFrontend/authorizeServiceFrontend.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainServiceBlockOutbox } from './drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { finalizeServiceCommands } from './finalizeServiceCommands/finalizeServiceCommands.js';
import { getReplicatedResources } from './getReplicatedResources/getReplicatedResources.js';
import { getServiceFrontendSnapshot } from './getServiceFrontendSnapshot/getServiceFrontendSnapshot.js';
import { replayServiceBlock } from './replayServiceBlock/replayServiceBlock.js';

/** Exact direct-RPC surface returned by the SERVICE_REPO binding. */
export interface IServiceRepoRpcTarget {
  authorizeServiceFrontend(props: {
    serviceName: string;
    frontendName: string;
    userId: string;
  }): IRpcEitherEncoded<void>;
  executeServiceQuery(props: {
    serviceName: string;
    queryName: string;
    params: unknown;
  }): IRpcEitherEncoded<unknown>;
  finalizeServiceCommands(props: {
    writeIndex: number;
    serviceName: string;
    commands: readonly IEncodedCommand<IServiceCommand>[];
  }): IRpcEitherEncoded<
    Readonly<{
      executedCommands: readonly IEncodedCommand<IExecutedServiceCommand>[];
      failedCommands: readonly IEncodedCommand<IFailedServiceCommand>[];
    }>
  >;
  drainServiceBlockOutbox(): IRpcEitherEncoded<void>;
  drainGeneration(): IRpcEitherEncoded<
    Readonly<{ pendingServiceBlockCount: number }>
  >;
  getReplicatedResources(props: {
    currentServiceIndex: number | null;
    resources: readonly Readonly<{
      modelName: string;
      resourceId: string;
    }>[];
  }): IRpcEitherEncoded<
    Readonly<{
      resources: readonly (
        | Readonly<{
            status: 'found';
            modelName: string;
            resourceId: string;
            resource: IEncodedResourceShape;
          }>
        | Readonly<{
            status: 'missing';
            modelName: string;
            resourceId: string;
            failure: IAnyErrorJson;
          }>
      )[];
      serviceBlocks: readonly IServiceBlock[];
      lastServiceCursor: IServiceCursorId;
      serviceIndex: number;
    }>
  >;
  getServiceFrontendSnapshot(props: {
    serviceName: string;
    frontendName: string;
  }): IRpcEitherEncoded<
    Readonly<{
      resources: readonly IEncodedResourceShape[];
      lastServiceCursor: IServiceCursorId | null;
      serviceIndex: number | null;
    }>
  >;
  replayServiceBlock(props: {
    prevGenerationId: string;
    block: IServiceBlock;
  }): IRpcEitherEncoded<
    Readonly<{
      replayed: boolean;
      lastServiceCursor: IServiceCursorId;
      serviceIndex: number;
      appliedMutationCount: number;
      discardedMutationCount: number;
    }>
  >;
  getRepoTableRows(props: {
    tableName: string;
  }): IRpcEitherEncoded<IRepoTableData>;
}

const serviceCommandOutcomeShape = {
  commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandBytes: primitives.text(),
  command: primitives.json({
    schema: Schema.Union(
      EncodedExecutedServiceCommandSchema,
      EncodedFailedServiceCommandSchema,
    ),
  }),
  serviceCursor: primitives.cursor({
    abbreviation: coreAbbreviations.serviceCursor,
  }),
  serviceIndex: primitives.integer({ unique: true }),
  appliedMutations: primitives.json({
    schema: Schema.Array(EncodedAppliedMutationSchema),
  }),
  writeIndex: primitives.integer(),
} satisfies IShape;

const serviceRepoTables = {
  serviceCommandOutcomes: makeTable({
    name: 'serviceCommandOutcomes',
    shape: serviceCommandOutcomeShape,
    indexes: [
      {
        name: 'serviceCommandOutcomes_serviceCursor_unique',
        columns: ['serviceCursor'],
        unique: true,
      },
      {
        name: 'serviceCommandOutcomes_serviceIndex_unique',
        columns: ['serviceIndex'],
        unique: true,
      },
    ],
  }),
  serviceBlockOutbox: makeTable({
    name: 'serviceBlockOutbox',
    shape: {
      lastServiceCursor: primitives.primaryKey({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      serviceIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: ServiceBlockSchema }),
      publishedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
  serviceReplayReceipts: makeTable({
    name: 'serviceReplayReceipts',
    shape: {
      prevGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      writeIndex: primitives.integer(),
      sourceBlockBytes: primitives.text(),
      targetBlockBytes: primitives.text(),
      sourceServiceIndex: primitives.integer(),
      lastServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      appliedMutationCount: primitives.integer(),
      discardedMutationCount: primitives.integer(),
      completedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'serviceReplayReceipts_generation_index_unique',
        columns: ['prevGenerationId', 'sourceServiceIndex'],
        unique: true,
      },
      {
        name: 'serviceReplayReceipts_sourceServiceIndex_idx',
        columns: ['sourceServiceIndex'],
      },
    ],
  }),
} satisfies IAnyTables;

export const serviceRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(serviceRepoTables);

const serviceBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceRepo,
  repoType: 'ServiceRepo',
  namePattern: RoutePattern.parse('/:generationId/:serviceName'),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceRepo.getDbConfig')(function* (props) {
    const legacyCursorColumns = [
      ...props.storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(serviceCursors)',
      ),
    ];
    const outcomeColumns = [
      ...props.storage.sql.exec<{ name: string }>(
        'PRAGMA table_info(serviceCommandOutcomes)',
      ),
    ].map(column => column.name);
    if (
      legacyCursorColumns.length > 0 ||
      (outcomeColumns.length > 0 &&
        [
          'commandId',
          'commandBytes',
          'command',
          'serviceCursor',
          'serviceIndex',
          'appliedMutations',
          'writeIndex',
        ].some(column => !outcomeColumns.includes(column)))
    ) {
      return yield* new ZerospinError({
        code: 'legacy-service-repo-outcome-persistence-reset-required',
        message:
          'ServiceRepo contains incompatible command persistence and must be reset before this code can run',
      });
    }

    const service = system.services[props.key.serviceName];
    const serviceModels = service?.models ?? {};

    return makeResourceDbConfig({
      models: serviceModels,
      otherTables: serviceRepoTables,
    });
  }),
});

/**
 * Service-repo Durable Object (one per `serviceName`, `SERVICE_REPO` binding).
 *
 * Owns service model resource state for service commands and publishes one
 * service block per finalized command batch to the singleton ServiceBlockRepo.
 */
export class ServiceRepo
  extends makeBoundDORepo({ boundDORepoConfig: serviceBoundDORepoConfig })
  implements IServiceRepoRpcTarget
{
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig = serviceBoundDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });

  async authorizeServiceFrontend(props: {
    serviceName: string;
    frontendName: string;
    userId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      authorizeServiceFrontend({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async executeServiceQuery(props: {
    serviceName: string;
    queryName: string;
    params: unknown;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeServiceQuery({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async finalizeServiceCommands(props: {
    writeIndex: number;
    serviceName: string;
    commands: readonly IEncodedCommand<IServiceCommand>[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        executedCommands: readonly IEncodedCommand<IExecutedServiceCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedServiceCommand>[];
      }>,
      IAnyErrorJson
    >
  > {
    const encoded = await this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        finalizeServiceCommands({
          ...props,
          db: this.db,
          key: this.key,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      ),
    );
    this.ctx.waitUntil(
      this.drainServiceBlockOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async drainServiceBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainServiceBlockOutbox({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        storage: this.ctx.storage,
        generationId: this.key.generationId,
        serviceName: this.key.serviceName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{ pendingServiceBlockCount: number }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        generationId: this.key.generationId,
        serviceName: this.key.serviceName,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getReplicatedResources(props: {
    currentServiceIndex: number | null;
    resources: readonly Readonly<{
      modelName: string;
      resourceId: string;
    }>[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        resources: readonly (
          | Readonly<{
              status: 'found';
              modelName: string;
              resourceId: string;
              resource: IEncodedResourceShape;
            }>
          | Readonly<{
              status: 'missing';
              modelName: string;
              resourceId: string;
              failure: IAnyErrorJson;
            }>
        )[];
        serviceBlocks: readonly IServiceBlock[];
        lastServiceCursor: IServiceCursorId;
        serviceIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplicatedResources({
        ...props,
        serviceName: this.key.serviceName,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getServiceFrontendSnapshot(props: {
    serviceName: string;
    frontendName: string;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        resources: readonly IEncodedResourceShape[];
        lastServiceCursor: IServiceCursorId | null;
        serviceIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getServiceFrontendSnapshot({
        ...props,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async replayServiceBlock(props: {
    prevGenerationId: string;
    block: IServiceBlock;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        replayed: boolean;
        lastServiceCursor: IServiceCursorId;
        serviceIndex: number;
        appliedMutationCount: number;
        discardedMutationCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return this.ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        replayServiceBlock({
          ...props,
          db: this.db,
          deliveryQueue: this.deliveryQueue,
          generationId: this.key.generationId,
          serviceName: this.key.serviceName,
          storage: this.ctx.storage,
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      ),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        generationId: this.key.generationId,
        serviceName: this.key.serviceName,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
