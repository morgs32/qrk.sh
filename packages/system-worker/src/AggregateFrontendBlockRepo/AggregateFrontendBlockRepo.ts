/* One frontend block archive and websocket room per aggregate actor/frontend projection. */

import { RoutePattern } from '@remix-run/route-pattern';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables } from '@zerospin/core/models/types';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type { IAggregateFrontendBlock } from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { assertArchiveThrough } from './assertArchiveThrough/assertArchiveThrough.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getArchiveBound } from './getArchiveBound/getArchiveBound.js';
import { getArchivedBlocks } from './getArchivedBlocks/getArchivedBlocks.js';
import { getPredecessor } from './getPredecessor/getPredecessor.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { recordPredecessor } from './recordPredecessor/recordPredecessor.js';
import { storeAggregateFrontendBlocks } from './storeAggregateFrontendBlocks/storeAggregateFrontendBlocks.js';

const aggregateFrontendBlockTables = {
  lineage: makeTable({
    name: 'lineage',
    shape: {
      id: primitives.text({ unique: true }),
      systemId: primitives.opaqueId({
        abbreviation: coreAbbreviations.system,
      }),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      aggregateId: primitives.opaqueId({
        abbreviation: coreAbbreviations.aggregate,
      }),
      aggregateName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      predecessorGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      predecessorRepoName: primitives.text({ nullable: true }),
      predecessorTerminalFrontendIndex: primitives.integer({ nullable: true }),
      replayFloorFrontendIndex: primitives.integer(),
    },
  }),
  aggregateFrontendBlocks: makeTable({
    name: 'aggregateFrontendBlocks',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      canonicalBytes: primitives.text(),
      frontendBlock: primitives.json({ schema: AggregateFrontendBlockSchema }),
    },
  }),
  aggregateFrontendResourceMaterializations: makeTable({
    name: 'aggregateFrontendResourceMaterializations',
    shape: {
      frontendIndex: primitives.integer(),
      deltaKind: primitives.enum({ values: ['inserted', 'updated'] }),
      canonicalOrdinal: primitives.integer(),
      modelName: primitives.text(),
      modelVersion: primitives.text(),
      canonicalResourceBytes: primitives.text(),
    },
    indexes: [
      {
        name: 'aggregateFrontendResourceMaterializations_identity_unique',
        columns: [
          'frontendIndex',
          'deltaKind',
          'canonicalOrdinal',
          'modelName',
          'modelVersion',
        ],
        unique: true,
      },
    ],
  }),
  aggregateFrontendModelVersionCoverage: makeTable({
    name: 'aggregateFrontendModelVersionCoverage',
    shape: {
      modelName: primitives.text(),
      modelVersion: primitives.text(),
      replayFloorFrontendIndex: primitives.integer(),
    },
    indexes: [
      {
        name: 'aggregateFrontendModelVersionCoverage_identity_unique',
        columns: ['modelName', 'modelVersion'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

const aggregateFrontendBlockDbConfig = makeDbConfig({
  tables: aggregateFrontendBlockTables,
});

export const aggregateFrontendBlockDrizzleSchemas =
  aggregateFrontendBlockDbConfig.schema;

const aggregateFrontendBlockBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateFrontendBlockRepo,
  namePattern: RoutePattern.parse(
    '/:generationId/:aggregateId/:aggregateName/:userId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('AggregateFrontendBlockRepo.getDbConfig')(
    function* () {
      yield* Effect.void;
      return aggregateFrontendBlockDbConfig;
    },
  ),
});

export class AggregateFrontendBlockRepo extends makeBoundDORepo({
  baseClass: Server,
  boundDORepoConfig: aggregateFrontendBlockBoundDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly boundDORepoConfig =
    aggregateFrontendBlockBoundDORepoConfig;

  async recordPredecessor(props: {
    systemId: string;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }> | null;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      recordPredecessor({
        ...props,
        db: this.db,
        key: this.key,
      }).pipe(encodeRpc),
    );
  }

  async storeAggregateFrontendBlocks(props: {
    blocks: readonly IAggregateFrontendBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      storeAggregateFrontendBlocks({
        blocks: props.blocks,
        db: this.db,
        key: this.key,
        broadcast: async block => {
          const deliveries: Promise<void>[] = [];
          for (const socket of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            aggregateId: string;
            aggregateName: string;
            userId: string;
            frontendName: string;
            aggregateFrontendLock: Schema.Schema.Type<
              typeof AggregateFrontendLockSchema
            >;
          }>()) {
            const socketState = socket.state;
            if (socketState?.phase === 'replaying') {
              socket.close(1012, 'aggregate-frontend-delivery-replay-raced');
              continue;
            }
            if (socketState?.phase !== 'live') {
              continue;
            }
            deliveries.push(
              managedRuntime
                .runPromise(
                  Effect.gen(this, function* () {
                    const archivedBlocks = yield* getArchivedBlocks({
                      afterFrontendIndex: block.frontendIndex - 1,
                      throughFrontendIndex: block.frontendIndex,
                      aggregateFrontendLock: socketState.aggregateFrontendLock,
                      db: this.db,
                      key: this.key,
                    });
                    const archivedBlock = archivedBlocks[0];
                    if (
                      archivedBlocks.length !== 1 ||
                      archivedBlock === undefined ||
                      archivedBlock.frontendIndex !== block.frontendIndex
                    ) {
                      return yield* new ZerospinError({
                        code: 'aggregate-frontend-delivery-archive-read-invalid',
                        message:
                          'Live frontend delivery did not resolve one persisted shaped block',
                      });
                    }
                    const encodedBlock = yield* Schema.encode(
                      AggregateFrontendBlockSchema,
                    )(archivedBlock).pipe(
                      mapParseError({
                        code: 'aggregate-frontend-delivery-block-encode-failed',
                        prefix:
                          'Failed to encode a persisted connection-specific frontend block',
                      }),
                    );
                    yield* Effect.try({
                      try: () =>
                        socket.send(
                          JSON.stringify({
                            type: 'aggregateFrontendBlock',
                            sync: encodedBlock,
                          }),
                        ),
                      catch: ZerospinError.catch({
                        code: 'aggregate-frontend-delivery-block-send-failed',
                        message:
                          'Failed to send a persisted connection-specific frontend block',
                      }),
                    });
                  }).pipe(
                    Effect.catchAll(() =>
                      Effect.sync(() =>
                        socket.close(
                          1011,
                          'aggregate-frontend-delivery-archive-read-failed',
                        ),
                      ),
                    ),
                  ),
                )
                .catch(() => {
                  socket.close(
                    1011,
                    'aggregate-frontend-delivery-archive-read-failed',
                  );
                }),
            );
          }
          await Promise.all(deliveries);
        },
      }).pipe(encodeRpc),
    );
  }

  async getArchiveBound(): Promise<
    Schema.EitherEncoded<
      Readonly<{ generationId: string; frontendIndex: number }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getArchiveBound({ db: this.db, key: this.key }).pipe(encodeRpc),
    );
  }

  async assertArchiveThrough(props: {
    frontendIndex: number;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      assertArchiveThrough({
        frontendIndex: props.frontendIndex,
        db: this.db,
        key: this.key,
      }).pipe(encodeRpc),
    );
  }

  async getArchivedBlocks(props: {
    afterFrontendIndex: number;
    throughFrontendIndex: number;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }): Promise<
    Schema.EitherEncoded<readonly IAggregateFrontendBlock[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getArchivedBlocks({
        ...props,
        db: this.db,
        key: this.key,
      }).pipe(encodeRpc),
    );
  }

  async getPredecessor(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        systemId: ISystemId;
        generationId: string;
        terminalFrontendIndex: number;
        predecessor: Readonly<{
          generationId: string;
          repoName: string;
          terminalFrontendIndex: number;
        }> | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getPredecessor({ db: this.db, key: this.key }).pipe(encodeRpc),
    );
  }

  async drainGeneration(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      drainGeneration({
        close: (code, reason) => {
          for (const socket of this.getConnections()) {
            socket.close(code, reason);
          }
        },
      }).pipe(encodeRpc),
    );
  }

  async onConnect(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    await managedRuntime.runPromise(
      onConnect({
        connection,
        request: context.request,
        key: this.key,
      }),
    );
  }

  async onMessage(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    }>,
    message: WSMessage,
  ): Promise<void> {
    await managedRuntime.runPromise(
      onMessage({
        connection,
        message,
        db: this.db,
        key: this.key,
        parseRepoName: repoName =>
          AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
            repoName,
          ),
        getPredecessorRepo: repoName =>
          this.env.AGGREGATE_FRONTEND_BLOCK_REPO.getByName(repoName),
      }).pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            connection.close(
              1011,
              'aggregate-frontend-delivery-adaptation-failed',
            ),
          ),
        ),
      ),
    );
  }
}
