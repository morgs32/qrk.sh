/* One frontend block archive and websocket room per actor/frontend projection. */

import { RoutePattern } from '@remix-run/route-pattern';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables } from '@zerospin/core/models/types';
import { FrontendLineageBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendLineageBlock } from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { assertArchiveThrough } from './assertArchiveThrough/assertArchiveThrough.js';
import { generationSuperseded } from './generationSuperseded/generationSuperseded.js';
import { getArchiveBound } from './getArchiveBound/getArchiveBound.js';
import { getArchivedBlocks } from './getArchivedBlocks/getArchivedBlocks.js';
import { getPredecessor } from './getPredecessor/getPredecessor.js';
import { migrateFrontendBlockRepo } from './migrateFrontendBlockRepo/migrateFrontendBlockRepo.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { recordPredecessor } from './recordPredecessor/recordPredecessor.js';
import { storeFrontendBlocks } from './storeFrontendBlocks/storeFrontendBlocks.js';

const frontendBlockTables = {
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
      accountId: primitives.opaqueId({
        abbreviation: coreAbbreviations.account,
      }),
      accountName: primitives.text(),
      actorName: primitives.text(),
      actorId: primitives.opaqueId({
        abbreviation: coreAbbreviations.actor,
      }),
      frontendName: primitives.text(),
      predecessorGenerationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
        nullable: true,
      }),
      predecessorRepoName: primitives.text({ nullable: true }),
      predecessorTerminalFrontendIndex: primitives.integer({ nullable: true }),
    },
  }),
  frontendBlocks: makeTable({
    name: 'frontendBlocks',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      canonicalBytes: primitives.text(),
      lineageBlock: primitives.json({ schema: FrontendLineageBlockSchema }),
    },
  }),
} satisfies IAnyTables;

const frontendBlockDbConfig = makeDbConfig({ tables: frontendBlockTables });

export const frontendBlockDrizzleSchemas = frontendBlockDbConfig.schema;

const frontendBlockRepoUtils = makeRepoUtils({
  abbreviation: systemWorkerAbbreviations.frontendBlockRepo,
  repoType: 'FrontendBlockRepo',
  namePattern: RoutePattern.parse(
    '/:generationId/:accountId/:accountName/:actorName/:actorId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('FrontendBlockRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return frontendBlockDbConfig;
  }),
});

export class FrontendBlockRepo extends makeRepo({
  baseClass: Server,
  repoUtils: frontendBlockRepoUtils,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = frontendBlockRepoUtils;

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        migrateFrontendBlockRepo({
          db: this.db,
          schema: this.schema,
        }),
      ),
    );
  }

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

  async storeFrontendBlocks(props: {
    blocks: readonly IFrontendLineageBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      storeFrontendBlocks({
        blocks: props.blocks,
        db: this.db,
        key: this.key,
        broadcast: message => {
          for (const socket of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
          }>()) {
            if (socket.state?.phase !== 'live') {
              continue;
            }
            try {
              socket.send(message);
            } catch (error) {
              void error;
            }
          }
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
  }): Promise<
    Schema.EitherEncoded<readonly IFrontendLineageBlock[], IAnyErrorJson>
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

  async generationSuperseded(props: {
    successorGenerationId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      generationSuperseded({
        successorGenerationId: props.successorGenerationId,
        key: this.key,
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
      frontendVersion: string;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    await managedRuntime.runPromise(
      onConnect({
        connection,
        request: context.request,
      }),
    );
  }

  async onMessage(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      frontendVersion: string;
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
          FrontendBlockRepo.repoUtils.nameUtils.parseName(repoName),
        getPredecessorRepo: repoName =>
          this.env.FRONTEND_BLOCK_REPO.getByName(repoName),
      }),
    );
  }
}
