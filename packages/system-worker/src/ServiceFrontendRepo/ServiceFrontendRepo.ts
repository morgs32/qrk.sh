/*
 * Actor-specific, read-only projection of one service frontend's declared
 * models. This repo and its archive are registered only after snapshot,
 * catch-up, and archive acknowledgement have all completed.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IActorId,
  IAnyTables,
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
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IServiceBlock } from '../types.js';

import { alarm } from './alarm/alarm.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainServiceFrontendBlockOutbox } from './drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js';
import { getFrontendState } from './getFrontendState/getFrontendState.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { handleServiceBlocks } from './handleServiceBlocks/handleServiceBlocks.js';
import { prepareSuccessor } from './prepareSuccessor/prepareSuccessor.js';

/** Exact direct-RPC surface returned by the SERVICE_FRONTEND_REPO binding. */
export interface IServiceFrontendRepoRpcTarget {
  getFrontendState(props: {
    systemId: string;
    systemWorkerName: string;
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
    lineage: Readonly<{
      mode: 'live' | 'no-local-segment';
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
      systemWorkerName: string;
      lastServiceCursor: string | null;
      serviceIndex: number | null;
      frontendIndex: number;
      segmentKind: 'root' | 'inherited' | 'no-local-segment';
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
      systemWorkerName: primitives.text(),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      serviceName: primitives.text(),
      actorName: primitives.text(),
      actorId: primitives.opaqueId({
        abbreviation: coreAbbreviations.actor,
      }),
      frontendName: primitives.text(),
      status: primitives.enum({ values: ['initializing', 'ready'] }),
      segmentKind: primitives.enum({
        values: ['root', 'inherited', 'no-local-segment'],
      }),
      emissionMode: primitives.enum({
        values: ['live', 'no-emission', 'read-only'],
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

const serviceFrontendRepoUtils = makeRepoUtils({
  abbreviation: systemWorkerAbbreviations.serviceFrontendRepo,
  namePattern: RoutePattern.parse(
    '/:generationId/:serviceName/:actorName/:actorId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceFrontendRepo.getDbConfig')(function* ({
    key,
  }) {
    const serviceController = yield* getByKeyOrThrow({
      record: system.serviceControllers,
      key: key.serviceName,
      recordKind: 'service controllers',
    });
    const actorController = yield* getByKeyOrThrow({
      record: serviceController.actorControllers,
      key: key.actorName,
      recordKind: `actor controllers owned by service ${key.serviceName}`,
    });
    const frontendBinding = yield* getByKeyOrThrow({
      record: actorController.frontends,
      key: key.frontendName,
      recordKind: `frontends owned by service actor ${key.serviceName}.${key.actorName}`,
    });

    return makeResourceDbConfig({
      models: frontendBinding.frontendController.models,
      otherTables: serviceFrontendRepoTables,
    });
  }),
});

export class ServiceFrontendRepo
  extends makeRepo({
    repoUtils: serviceFrontendRepoUtils,
  })
  implements IServiceFrontendRepoRpcTarget
{
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = serviceFrontendRepoUtils;

  async getFrontendState(props: {
    systemId: string;
    systemWorkerName: string;
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
    lineage: Readonly<{
      mode: 'live' | 'no-local-segment';
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Promise<Schema.EitherEncoded<IServiceFrontendState, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getFrontendState({
        ...props,
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
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
        });
        yield* drainServiceFrontendBlockOutbox({
          db: this.db,
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
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getProjectionReadiness(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        generationId: string;
        systemWorkerName: string;
        lastServiceCursor: string | null;
        serviceIndex: number | null;
        frontendIndex: number;
        segmentKind: 'root' | 'inherited' | 'no-local-segment';
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
        inspectionOnly: this.env.ZEROSPIN_SELF_HOSTED === 'true',
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        db: this.db,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
