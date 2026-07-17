import type { IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import { makeTx } from '../drizzle/makeTx.ts';
import { migrateDb } from '../drizzle/migrateDb.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type {
  IFrontendState,
  ISessionDrizzleDb,
  ISessionSchema,
} from './types.ts';

/*
 * 1. Replace every local table with the FrontendRepo snapshot.
 * 2. Insert optimistic resource rows exactly as returned by FrontendRepo.
 * 3. Insert pending and terminal command ledgers without replaying commands.
 *
 * `lastRebasedPushedCursor` travels in session state, not SQLite. Pending
 * commands at or below that watermark are already represented in `resources`.
 */
export const applyFrontendState = Effect.fn('applyFrontendState')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  frontend: FRONTEND;
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
  models: InferFrontendModels<FRONTEND>;
  frontendState: IFrontendState;
}): Effect.fn.Return<void, IAnyError> {
  const { db, frontendState, models, schema } = props;
  const { pushedCommands } = frontendState;

  yield* makeTx({
    db,
    program: Effect.fn('transaction')(function* ({ tx }) {
      yield* Effect.void;
      const rows = tx.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      );
      for (const row of rows) {
        const tableName = row.name.replaceAll('"', '""');
        tx.run(sql.raw(`DROP TABLE IF EXISTS "${tableName}"`));
      }
    }),
  });

  yield* migrateDb({
    db,
    schema,
  });

  yield* makeTx({
    db,
    program: Effect.fn('applyFrontendState.insertResources')(function* ({
      tx,
    }) {
      for (const resource of frontendState.resources) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: resource.modelName,
          recordKind: 'models',
        });
        const table = model.drizzleSchema;
        tx.insert(table).values(resource).run();
      }
    }),
  });

  yield* makeTx({
    db,
    program: Effect.fn('applyFrontendState.insertPushedCommands')(function* ({
      tx,
    }) {
      yield* Effect.void;
      for (const command of pushedCommands) {
        upsertHelper({
          table: sessionPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
      }
    }),
  });

  yield* makeTx({
    db,
    program: Effect.fn('applyFrontendState.insertExecutedPushedCommands')(
      function* ({ tx }) {
        yield* Effect.void;
        for (const command of frontendState.executedPushedCommands) {
          upsertHelper({
            table: sessionExecutedPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
      },
    ),
  });

  yield* makeTx({
    db,
    program: Effect.fn('applyFrontendState.insertFailedPushedCommands')(
      function* ({ tx }) {
        yield* Effect.void;
        for (const command of frontendState.failedPushedCommands) {
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: {
              id: command.id,
              commandName: command.commandName,
              payload: command.payload,
              version: command.version,
              status: 'failed',
              failedAt: command.failedAt,
              failure: command.failure,
            },
          });
        }
      },
    ),
  });
});
