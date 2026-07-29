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
import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAccountCursor,
  IActorId,
  IAnyTables,
  IShape,
} from '@zerospin/core/models/types';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendSyncState } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Either, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IActorBlock } from '../types.js';

import { drainFrontendBlockOutbox } from './drainFrontendBlockOutbox/drainFrontendBlockOutbox.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainPushedBlockOutbox } from './drainPushedBlockOutbox/drainPushedBlockOutbox.js';
import { getFrontendState } from './getFrontendState/getFrontendState.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { handleActorBlocks } from './handleActorBlocks/handleActorBlocks.js';
import { prepareSuccessor } from './prepareSuccessor/prepareSuccessor.js';
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
  executedPushedCommands: makeTable({
    name: 'executedPushedCommands',
    shape: {
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
      pushedAt: primitives.date(),
      pushedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.pushedCursor,
      }),
      mode: primitives.enum({
        values: ['authoritative', 'optimistic-lww'],
      }),
      accountCursor: primitives.cursor({
        abbreviation: coreAbbreviations.accountCursor,
      }),
      accountIndex: primitives.integer(),
      executedAt: primitives.date(),
      status: primitives.enum({ values: ['executed'] }),
    },
  }),
  failedPushedCommands: makeTable({
    name: 'failedPushedCommands',
    shape: {
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
      pushedAt: primitives.date(),
      pushedCursor: primitives.cursor({
        abbreviation: coreAbbreviations.pushedCursor,
      }),
      accountCursor: primitives.cursor({
        abbreviation: coreAbbreviations.accountCursor,
      }),
      accountIndex: primitives.integer(),
      failedAt: primitives.date(),
      failure: primitives.text(),
      status: primitives.enum({ values: ['failed'] }),
    },
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
  abbreviation: systemWorkerAbbreviations.frontendRepo,
  namePattern: RoutePattern.parse(
    '/:generationId/:accountId/:accountName/:actorName/:actorId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('FrontendRepo.getDbConfig')(function* ({
    key,
    storage,
  }) {
    // 1 — Ordinary repos take their exact model graph from the current frontend.
    const frontendControllerResult = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    }).pipe(Effect.either);
    if (Either.isRight(frontendControllerResult)) {
      return makeResourceDbConfig({
        models: frontendControllerResult.right.models,
        otherTables: frontendRepoTables,
      });
    }

    // 2 — A self-hosted upgrade has only the newly uploaded Worker code. It may inspect an
    // already-bootstrapped source repo whose actor or frontend was intentionally removed, but a
    // hosted Worker, new invalid repo key, or unrelated controller failure remains unchanged.
    if (
      env.ZEROSPIN_SELF_HOSTED !== 'true' ||
      storage.kv.get('_isBootstrapped') !== 'true' ||
      (frontendControllerResult.left.code !== 'actorControllers-not-found' &&
        frontendControllerResult.left.code !== 'frontends-not-found')
    ) {
      return yield* frontendControllerResult.left;
    }

    // 3 — Resolve the retained account only for that historical drain. Removing an entire
    // account is a different compatibility boundary and must not be hidden here.
    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: key.accountName,
      recordKind: 'accountControllers',
    });

    // 4 — A removed frontend's account owns the same durable model tables, while the stable
    // FrontendRepo tables below contain the only outboxes inspected during self-hosted drain.
    // No visitor controller or compatibility export is recreated.
    return makeResourceDbConfig({
      models: accountController.models,
      otherTables: frontendRepoTables,
    });
  }),
});

export class FrontendRepo extends makeRepo({ repoUtils: frontendRepoUtils }) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = frontendRepoUtils;

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);

    // The base repo marker predates additive table migrations. Re-run the
    // idempotent schema migration on every cold start so existing projections
    // receive the complete terminal-command tables before any RPC can read or
    // write them.
    ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        migrateDb({ db: this.db, schema: this.schema }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (this.ctx.storage.kv.get('initialized') === true) {
                // The two legacy defaults are independent durable writes. A
                // cold restart may therefore observe either one without the
                // other and must finish only the missing write.
                if (
                  this.ctx.storage.kv.get('emissionMode') === undefined
                ) {
                  this.ctx.storage.kv.put('emissionMode', 'live');
                }
                if (this.ctx.storage.kv.get('segmentKind') === undefined) {
                  this.ctx.storage.kv.put('segmentKind', 'root');
                }
              }
            }),
          ),
          Effect.provide(AsyncLive),
        ),
      ),
    );
  }

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
    lineage: Readonly<{
      mode: 'live' | 'no-local-segment';
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Promise<Schema.EitherEncoded<IFrontendSyncState, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      getFrontendState({
        ...props,
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        frontendRepoSchema: this.schema,
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

  async getProjectionReadiness(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        generationId: string;
        systemWorkerName: string;
        lastAccountCursor: string | null;
        accountIndex: number | null;
        frontendIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getProjectionReadiness({
        db: this.db,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async prepareSuccessor(props: {
    sourceState: IFrontendSyncState;
    lastAccountCursor: IAccountCursor | null;
    accountIndex: number | null;
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
        frontendRepoSchema: this.schema,
        key: this.key,
        name: this.ctx.id.name ?? '',
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainFrontendBlockOutbox(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainFrontendBlockOutbox({
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
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
        configuredSystemId: this.env.ZEROSPIN_SYSTEM_ID,
        db: this.db,
        inspectionOnly: this.env.ZEROSPIN_SELF_HOSTED === 'true',
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await this.drainFrontendBlockOutbox();
  }
}
