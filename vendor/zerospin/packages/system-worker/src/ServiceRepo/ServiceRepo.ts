/*
 * System-worker annotation:
 * Defines the ServiceRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
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
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import { ServiceBlockSchema } from '../blockSchemas.js';
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IServiceBlock } from '../types.js';

import { drainServiceBlockOutbox } from './drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { executeActorQuery } from './executeActorQuery/executeActorQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { finalizeServiceCommands } from './finalizeServiceCommands/finalizeServiceCommands.js';
import { getReplicatedResources } from './getReplicatedResources/getReplicatedResources.js';
import { replayServiceBlock } from './replayServiceBlock/replayServiceBlock.js';

/** Exact direct-RPC surface returned by the SERVICE_REPO binding. */
export interface IServiceRepoRpcTarget {
  finalizeServiceCommands(props: {
    serviceName: string;
    commands: readonly IServiceCommand[];
  }): IRpcEitherEncoded<
    Readonly<{
      executedCommands: readonly IExecutedServiceCommand[];
      failedCommands: readonly IFailedServiceCommand[];
    }>
  >;
  drainServiceBlockOutbox(): IRpcEitherEncoded<void>;
  drainGeneration(): IRpcEitherEncoded<
    Readonly<{ pendingServiceBlockCount: number }>
  >;
  executeServiceQuery(props: {
    serviceName: string;
    queryName: string;
    params: unknown;
  }): IRpcEitherEncoded<unknown>;
  executeActorQuery(props: {
    accountName: string;
    actorId: string;
    actorName: string;
    params: unknown;
    queryName: string;
    frontendName: string;
  }): IRpcEitherEncoded<unknown>;
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
  replayServiceBlock(props: {
    deployId: string;
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

const serviceCursorShape = {
  commandId: primitives.text(),
  serviceCursor: primitives.primaryKey({
    abbreviation: coreAbbreviations.serviceCursor,
  }),
  serviceIndex: primitives.integer({ unique: true }),
  appliedAt: primitives.date(),
} satisfies IShape;

const serviceRepoTables = {
  serviceCursors: makeTable({
    name: 'serviceCursors',
    shape: serviceCursorShape,
    indexes: [
      {
        name: 'serviceCursors_commandId',
        columns: ['commandId'],
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
      deployId: primitives.opaqueId({
        abbreviation: cloudIdAbbreviations.deploy,
      }),
      prevGenerationId: primitives.opaqueId({
        abbreviation: cloudIdAbbreviations.generation,
      }),
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
        name: 'serviceReplayReceipts_deploy_generation_index_unique',
        columns: ['deployId', 'prevGenerationId', 'sourceServiceIndex'],
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

const serviceRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.serviceRepo,
  repoType: 'ServiceRepo',
  namePattern: RoutePattern.parse('/:generationId/:serviceName'),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceRepo.getDbConfig')(function* (props) {
    yield* Effect.void;

    const serviceController = system.serviceControllers[props.key.serviceName];
    const serviceModels = serviceController?.models ?? {};

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
  extends makeRepo({ repoUtils: serviceRepoUtils })
  implements IServiceRepoRpcTarget
{
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = serviceRepoUtils;

  async finalizeServiceCommands(props: {
    serviceName: string;
    commands: readonly IServiceCommand[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        executedCommands: readonly IExecutedServiceCommand[];
        failedCommands: readonly IFailedServiceCommand[];
      }>,
      IAnyErrorJson
    >
  > {
    const encoded = await managedRuntime.runPromise(
      finalizeServiceCommands({
        ...props,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
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
        local: this.env.ZEROSPIN_INSTANCE_ID === 'local',
        generationId: this.key.generationId,
        serviceName: this.key.serviceName,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async executeServiceQuery(props: {
    serviceName: string;
    queryName: string;
    params: unknown;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeServiceQuery({
        ...props,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async executeActorQuery(props: {
    accountName: string;
    actorId: string;
    actorName: string;
    params: unknown;
    queryName: string;
    frontendName: string;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeActorQuery({
        ...props,
        db: this.db,
        serviceName: this.key.serviceName,
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

  async replayServiceBlock(props: {
    deployId: string;
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
    return managedRuntime.runPromise(
      replayServiceBlock({
        ...props,
        db: this.db,
        generationId: this.key.generationId,
        serviceName: this.key.serviceName,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await this.drainServiceBlockOutbox();
  }
}
