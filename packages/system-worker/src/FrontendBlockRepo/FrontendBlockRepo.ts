/* One frontend block archive and websocket room per actor/frontend projection. */

import { RoutePattern } from '@remix-run/route-pattern';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables } from '@zerospin/core/models/types';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendBlock } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { Server } from 'partyserver';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';

import { storeFrontendBlocks } from './storeFrontendBlocks/storeFrontendBlocks.js';

const frontendBlockTables = {
  frontendBlocks: makeTable({
    name: 'frontendBlocks',
    shape: {
      frontendIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: FrontendBlockSchema }),
    },
  }),
} satisfies IAnyTables;

const frontendBlockDbConfig = makeDbConfig({ tables: frontendBlockTables });

export const frontendBlockDrizzleSchemas = frontendBlockDbConfig.schema;

const frontendBlockRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.frontendBlockRepo,
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

  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = frontendBlockRepoUtils;

  async storeFrontendBlocks(props: {
    blocks: readonly IFrontendBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      storeFrontendBlocks({
        blocks: props.blocks,
        db: this.db,
        broadcast: message => {
          for (const socket of this.ctx.getWebSockets()) {
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
}
