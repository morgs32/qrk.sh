/*
 * One immutable lineage archive and WebSocket room per service-owned actor
 * frontend. The repository is intentionally not auto-registered: its paired
 * projection publishes both registrations only after bootstrap is complete.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IActorId, IAnyTables } from '@zerospin/core/models/types';
import { ServiceFrontendLineageBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendLineageBlock } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
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
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { recordPredecessor } from './recordPredecessor/recordPredecessor.js';
import { storeServiceFrontendBlocks } from './storeServiceFrontendBlocks/storeServiceFrontendBlocks.js';

/** Exact direct-RPC surface returned by the SERVICE_FRONTEND_BLOCK_REPO binding. */
export interface IServiceFrontendBlockRepoRpcTarget {
  recordPredecessor(props: {
    systemId: string;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }> | null;
  }): IRpcEitherEncoded<void>;
  storeServiceFrontendBlocks(props: {
    blocks: readonly IServiceFrontendLineageBlock[];
  }): IRpcEitherEncoded<void>;
  getArchiveBound(): IRpcEitherEncoded<
    Readonly<{ generationId: string; frontendIndex: number }>
  >;
  assertArchiveThrough(props: {
    frontendIndex: number;
  }): IRpcEitherEncoded<void>;
  getArchivedBlocks(props: {
    afterFrontendIndex: number;
    throughFrontendIndex: number;
  }): IRpcEitherEncoded<readonly IServiceFrontendLineageBlock[]>;
  getPredecessor(): IRpcEitherEncoded<
    Readonly<{
      systemId: ISystemId;
      generationId: string;
      serviceName: string;
      actorName: string;
      actorId: IActorId;
      frontendName: string;
      terminalFrontendIndex: number;
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>
  >;
  generationSuperseded(props: {
    successorGenerationId: string;
  }): IRpcEitherEncoded<void>;
}

const serviceFrontendBlockTables = {
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
      serviceName: primitives.text(),
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
  serviceFrontendBlocks: makeTable({
    name: 'serviceFrontendBlocks',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      systemId: primitives.opaqueId({
        abbreviation: coreAbbreviations.system,
      }),
      generationId: primitives.opaqueId({
        abbreviation: coreAbbreviations.generation,
      }),
      serviceName: primitives.text(),
      actorName: primitives.text(),
      actorId: primitives.opaqueId({
        abbreviation: coreAbbreviations.actor,
      }),
      frontendName: primitives.text(),
      kind: primitives.enum({
        values: ['generation-boundary', 'service-frontend'],
      }),
      canonicalBytes: primitives.text(),
      lineageBlock: primitives.json({
        schema: ServiceFrontendLineageBlockSchema,
      }),
    },
  }),
} satisfies IAnyTables;

const serviceFrontendBlockDbConfig = makeDbConfig({
  tables: serviceFrontendBlockTables,
});

export const serviceFrontendBlockDrizzleSchemas =
  serviceFrontendBlockDbConfig.schema;

const serviceFrontendBlockRepoUtils = makeRepoUtils({
  abbreviation: systemWorkerAbbreviations.serviceFrontendBlockRepo,
  namePattern: RoutePattern.parse(
    '/:generationId/:serviceName/:actorName/:actorId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceFrontendBlockRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return serviceFrontendBlockDbConfig;
  }),
});

export class ServiceFrontendBlockRepo
  extends makeRepo({
    baseClass: Server,
    repoUtils: serviceFrontendBlockRepoUtils,
  })
  implements IServiceFrontendBlockRepoRpcTarget
{
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = serviceFrontendBlockRepoUtils;

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

  async storeServiceFrontendBlocks(props: {
    blocks: readonly IServiceFrontendLineageBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      storeServiceFrontendBlocks({
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
    Schema.EitherEncoded<readonly IServiceFrontendLineageBlock[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getArchivedBlocks({
        ...props,
        db: this.db,
        key: this.key,
      }).pipe(encodeRpc),
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

  async getPredecessor(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        systemId: ISystemId;
        generationId: string;
        serviceName: string;
        actorName: string;
        actorId: IActorId;
        frontendName: string;
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
          ServiceFrontendBlockRepo.repoUtils.nameUtils.parseName(repoName),
        getPredecessorRepo: repoName =>
          this.env.SERVICE_FRONTEND_BLOCK_REPO.getByName(repoName),
      }),
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
}
