import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  IActorId,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { IFrontendState } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { bootstrap, FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

export const getFrontendState = Effect.fn('FrontendRepo.getFrontendState')(
  function* (props: {
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
    systemWorkerName: string;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
    name: string;
    db: IDb;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<IFrontendState, IAnyError, Async> {
    const { db, key, name, storage, systemWorkerName } = props;
    yield* bootstrap({ key, name, db, storage });
    const frontendController = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    });
    const resources: IEncodedResourceShape[] = [];
    for (const modelName of Object.keys(frontendController.models)) {
      const model = yield* getByKeyOrThrow({
        record: frontendController.models,
        key: modelName,
        recordKind: 'frontend models',
      });
      for (const row of db.select().from(model.drizzleSchema).all()) {
        resources.push(row as IEncodedResourceShape);
      }
    }
    const frontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
    const lastRebasedPushedCursor = yield* Schema.decodeUnknown(
      Schema.UndefinedOr(
        makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
      ),
    )(storage.kv.get('lastRebasedPushedCursor')).pipe(
      mapParseError({
        code: 'frontend-repo-invalid-last-rebased-pushed-cursor',
        prefix: 'Failed to decode FrontendRepo pushed rebase watermark',
      }),
    );
    return {
      actorId: key.actorId as IActorId,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
      systemWorkerName,
      frontendIndex: typeof frontendIndex === 'number' ? frontendIndex : 0,
      lastRebasedPushedCursor: lastRebasedPushedCursor ?? null,
      pushedCommands: db
        .select()
        .from(frontendRepoDrizzleSchemas.pushedCommands)
        .all(),
      resources,
      executedPushedCommands: [],
      failedPushedCommands: [],
    };
  },
);
