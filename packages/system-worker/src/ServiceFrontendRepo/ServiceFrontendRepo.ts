/*
 * Actor-scoped, read-only projection of one service frontend's declared
 * models. This repo and its archive are registered only after snapshot,
 * catch-up, and archive acknowledgement have all completed.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAnyShape,
  IAnyTables,
  IModels,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import { ServiceBlockSchema } from '../blockSchemas.js';
import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IServiceBlock } from '../types.js';

import { alarm } from './alarm/alarm.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainServiceFrontendBlockOutbox } from './drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getState } from './getState/getState.js';
import { handleServiceBlocks } from './handleServiceBlocks/handleServiceBlocks.js';
import { prepareSuccessor } from './prepareSuccessor/prepareSuccessor.js';

/** Exact direct-RPC surface returned by the SERVICE_FRONTEND_REPO binding. */
export interface IServiceFrontendRepoRpcTarget {
  getState(props: {
    systemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    lineage: Readonly<{
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): IRpcEitherEncoded<IServiceFrontendState>;
  handleServiceBlocks(props: {
    serviceName: string;
    blocks: readonly IServiceBlock[];
  }): IRpcEitherEncoded<void>;
  drainServiceFrontendBlockOutbox(): IRpcEitherEncoded<void>;
  getProjectionReadiness(): IRpcEitherEncoded<
    Readonly<{
      generationId: string;
      lastServiceCursor: string | null;
      serviceIndex: number | null;
      frontendIndex: number;
      segmentKind: 'root' | 'inherited';
      predecessorGenerationId: string | null;
      predecessorRepoName: string | null;
      predecessorTerminalFrontendIndex: number | null;
    }>
  >;
  prepareSuccessor(props: {
    sourceState: IServiceFrontendState;
    lastServiceCursor: IServiceCursorId | null;
    serviceIndex: number | null;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }>;
  }): IRpcEitherEncoded<void>;
  drainGeneration(): IRpcEitherEncoded<
    Readonly<{ pendingServiceFrontendBlockCount: number }>
  >;
}

const serviceFrontendRepoTables = {
  projectionState: makeTable({
    name: 'projectionState',
    shape: {
      id: primitives.text({ unique: true }),
      systemId: primitives.opaqueId({
        abbreviation: coreAbbreviations.system,
      }),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      serviceName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      status: primitives.enum({ values: ['initializing', 'ready'] }),
      segmentKind: primitives.enum({
        values: ['root', 'inherited'],
      }),
      emissionMode: primitives.enum({
        values: ['live', 'no-emission'],
      }),
      lastServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
        nullable: true,
      }),
      serviceIndex: primitives.integer({ nullable: true }),
      frontendIndex: primitives.integer(),
      predecessorGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      predecessorRepoName: primitives.text({ nullable: true }),
      predecessorTerminalFrontendIndex: primitives.integer({ nullable: true }),
    },
  }),
  serviceBlockReceipts: makeTable({
    name: 'serviceBlockReceipts',
    shape: {
      lastServiceCursor: primitives.primaryKey({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      serviceIndex: primitives.integer({ unique: true }),
      canonicalBytes: primitives.text(),
      block: primitives.json({ schema: ServiceBlockSchema }),
    },
  }),
  serviceFrontendBlockOutbox: makeTable({
    name: 'serviceFrontendBlockOutbox',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: ServiceFrontendBlockSchema }),
      publishedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
} satisfies IAnyTables;

export const serviceFrontendRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(serviceFrontendRepoTables);

const serviceFrontendBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceFrontendRepo,
  namePattern: RoutePattern.parse(
    '/:generationId/:serviceName/:userId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceFrontendRepo.getDbConfig')(function* ({
    key,
  }) {
    const service = yield* getByKeyOrThrow({
      record: system.services,
      key: key.serviceName,
      recordKind: 'services',
    });
    const frontendBinding = yield* getByKeyOrThrow({
      record: service.frontends,
      key: key.frontendName,
      recordKind: `frontends owned by service ${key.serviceName}`,
    });

    const projectionTables: IAnyTables = {};
    for (const model of Object.values(frontendBinding.controller.models)) {
      projectionTables[model.modelName] = model.table;
    }

    const serviceModels: IModels = service.models;
    const serviceSourceTables: IAnyTables = {};
    const serviceSourceShapes: Record<string, IAnyShape> = {};
    const physicalTableNames: Record<string, string> = {};
    for (const model of Object.values(serviceModels)) {
      const sourceTableKey = `serviceSource_${model.modelName}`;
      const sourceShape: IAnyShape = {};
      serviceSourceShapes[model.modelName] = sourceShape;
      serviceSourceTables[sourceTableKey] = {
        ...model.table,
        shape: sourceShape,
      };
      physicalTableNames[sourceTableKey] = sourceTableKey;
    }
    for (const model of Object.values(serviceModels)) {
      const sourceShape = serviceSourceShapes[model.modelName];
      if (sourceShape === undefined) {
        return yield* new ZerospinError({
          code: 'service-frontend-source-shape-missing',
          message: `ServiceFrontendRepo source shape for service model "${model.modelName}" is missing`,
        });
      }
      const modelShape: IAnyShape = model.table.shape;
      for (const [propertyName, descriptor] of Object.entries(modelShape)) {
        if (descriptor.kind !== PrimitiveKind.Ref) {
          sourceShape[propertyName] = descriptor;
          continue;
        }
        const targetModel = serviceModels[descriptor.targetTableName];
        const targetSourceTable =
          serviceSourceTables[`serviceSource_${descriptor.targetTableName}`];
        if (
          targetModel === undefined ||
          targetModel.table !== descriptor.table ||
          targetSourceTable === undefined
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-source-ref-target-missing',
            message: `ServiceFrontendRepo source ref ${model.modelName}.${propertyName} targets an unregistered service model table`,
          });
        }
        sourceShape[propertyName] = {
          ...descriptor,
          table: targetSourceTable,
        };
      }
    }

    return makeDbConfig({
      tables: {
        ...projectionTables,
        ...serviceFrontendRepoTables,
        ...serviceSourceTables,
      },
      physicalTableNames,
    });
  }),
});

export class ServiceFrontendRepo
  extends makeBoundDORepo({
    boundDORepoConfig: serviceFrontendBoundDORepoConfig,
  })
  implements IServiceFrontendRepoRpcTarget
{
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig = serviceFrontendBoundDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });

  async getState(props: {
    systemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    lineage: Readonly<{
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Promise<Schema.EitherEncoded<IServiceFrontendState, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getState({
        ...props,
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        name: this.ctx.id.name ?? '',
        serviceFrontendRepoSchema: this.schema,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async handleServiceBlocks(props: {
    serviceName: string;
    blocks: readonly IServiceBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        yield* handleServiceBlocks({
          ...props,
          db: this.db,
          key: this.key,
          serviceFrontendRepoSchema: this.schema,
          storage: this.ctx.storage,
        });
        yield* drainServiceFrontendBlockOutbox({
          db: this.db,
          deliveryQueue: this.deliveryQueue,
          key: this.key,
          storage: this.ctx.storage,
        });
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainServiceFrontendBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainServiceFrontendBlockOutbox({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getProjectionReadiness(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        generationId: string;
        lastServiceCursor: string | null;
        serviceIndex: number | null;
        frontendIndex: number;
        segmentKind: 'root' | 'inherited';
        predecessorGenerationId: string | null;
        predecessorRepoName: string | null;
        predecessorTerminalFrontendIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getProjectionReadiness({ db: this.db, key: this.key }).pipe(encodeRpc),
    );
  }

  async prepareSuccessor(props: {
    sourceState: IServiceFrontendState;
    lastServiceCursor: IServiceCursorId | null;
    serviceIndex: number | null;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }>;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      prepareSuccessor({
        ...props,
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        key: this.key,
        name: this.ctx.id.name ?? '',
        serviceFrontendRepoSchema: this.schema,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{ pendingServiceFrontendBlockCount: number }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
