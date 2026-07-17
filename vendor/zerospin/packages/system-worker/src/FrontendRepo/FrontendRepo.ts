/*
 * FrontendRepo owns one actor/frontend projection from ordered actor blocks.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PushedBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IActorId, IAnyTables, IShape } from '@zerospin/core/models/types';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendState } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IActorBlock } from '../types.js';

import { drainFrontendBlockOutbox } from './drainFrontendBlockOutbox/drainFrontendBlockOutbox.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainPushedBlockOutbox } from './drainPushedBlockOutbox/drainPushedBlockOutbox.js';
import { getFrontendState } from './getFrontendState/getFrontendState.js';
import { handleActorBlocks } from './handleActorBlocks/handleActorBlocks.js';
import { pushCommands } from './pushCommands/pushCommands.js';

const frontendRepoPushedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  systemVersion: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({ values: ['frontend'] }),
  accountId: primitives.text(),
  accountName: primitives.text(),
  frontendName: primitives.text(),
  actorId: primitives.text(),
  actorName: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  status: primitives.enum({ values: ['pushed'] }),
  pushedAt: primitives.date(),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
  }),
} satisfies IShape;

const frontendRepoTables = {
  graph: makeTable({
    name: 'graph',
    shape: {
      resourceId: primitives.text({ unique: true }),
      modelName: primitives.text(),
    },
    indexes: [
      {
        name: 'frontendRepo_graph_resourceId_unique',
        columns: ['resourceId'],
        unique: true,
      },
    ],
  }),
  pushedCommands: makeTable({
    name: 'pushedCommands',
    shape: frontendRepoPushedCommandShape,
  }),
  pushedMutations: makeTable({
    name: 'pushedMutations',
    shape: {
      commandId: primitives.text(),
      mutationIndex: primitives.integer(),
      modelName: primitives.text(),
      modelVersion: primitives.text(),
      resourceId: primitives.text(),
      operationName: primitives.enum({
        values: ['create', 'delete', 'move', 'replicateResource', 'update'],
      }),
      operation: primitives.text(),
      appliedAt: primitives.date(),
      lastAppliedAt: primitives.date({ nullable: true }),
      inverseOperation: primitives.text(),
    },
    indexes: [
      {
        name: 'frontendRepo_pushedMutations_command_mutation_unique',
        columns: ['commandId', 'mutationIndex'],
        unique: true,
      },
    ],
  }),
  pushedBlockOutbox: makeTable({
    name: 'pushedBlockOutbox',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'pblk' }),
      sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
      firstPushedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.pushedCursor,
        unique: true,
      }),
      block: primitives.json({ schema: PushedBlockSchema }),
      finalizedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
  frontendBlockOutbox: makeTable({
    name: 'frontendBlockOutbox',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: FrontendBlockSchema }),
      publishedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
} satisfies IAnyTables;

export const frontendRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(frontendRepoTables);

const frontendRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.frontendRepo,
  repoType: 'FrontendRepo',
  namePattern: RoutePattern.parse(
    '/:generationId/:accountId/:accountName/:actorName/:actorId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('FrontendRepo.getDbConfig')(function* ({ key }) {
    const frontendController = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    });
    return makeResourceDbConfig({
      models: frontendController.models,
      otherTables: frontendRepoTables,
    });
  }),
});

export class FrontendRepo extends makeRepo({ repoUtils: frontendRepoUtils }) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = frontendRepoUtils;

  async handleActorBlocks(
    blocks: readonly IActorBlock[],
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      handleActorBlocks({
        blocks,
        db: this.db,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      Promise.all([
        this.drainFrontendBlockOutbox(),
        this.drainPushedBlockOutbox(),
      ]).then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async pushCommands(props: {
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
    commands: readonly IEncodedCommand<IStagedCommand>[];
  }): Promise<
    Schema.EitherEncoded<
      {
        pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
        pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
      },
      IAnyErrorJson
    >
  > {
    const encoded = await managedRuntime.runPromise(
      pushCommands({
        ...props,
        db: this.db,
        key: this.key,
        name: this.ctx.id.name ?? '',
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainPushedBlockOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async getFrontendState(props: {
    accountId: string;
    accountName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    systemWorkerName: string;
  }): Promise<Schema.EitherEncoded<IFrontendState, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      getFrontendState({
        ...props,
        db: this.db,
        key: this.key,
        name: this.ctx.id.name ?? '',
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainPushedBlockOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async drainFrontendBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainFrontendBlockOutbox({
        db: this.db,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainPushedBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainPushedBlockOutbox({
        db: this.db,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingPushedBlockCount: number;
        pendingFrontendBlockCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        local: this.env.ZEROSPIN_INSTANCE_ID === 'local',
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await this.drainFrontendBlockOutbox();
  }
}
