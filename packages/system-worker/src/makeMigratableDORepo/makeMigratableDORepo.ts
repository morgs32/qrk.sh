import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import type {
  IDb,
  IDbConfig,
  IDbConfigRelations,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import {
  catchZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { DurableObject } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeDORepo } from '../makeDORepo/makeDORepo.js';

import { applyMigratableDORepoMigration } from './applyMigratableDORepoMigration/applyMigratableDORepoMigration.js';
import { APPLIED_MIGRATIONS_TABLE } from './applyMigratableDORepoMigration/applyMigratableDORepoMigrationTx.js';
import type { IMigratableDORepoConfig } from './types.js';

const CREATE_APPLIED_MIGRATIONS_SQL = `CREATE TABLE IF NOT EXISTS ${APPLIED_MIGRATIONS_TABLE} (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  appliedAt INTEGER NOT NULL
);`;

/*
 * Factory for evolving-schema Durable Object Repos. Callers pass
 * `migratableDORepoConfig` (ordered SQL migrations + bootstrap);
 * this factory supplies `initializeSchema` to `makeDORepo`, which runs it on
 * every activation inside `blockConcurrencyWhile` — including after bootstrap.
 * `makeFixedDORepo` is the provision-once sibling and skips schema work once
 * `_isBootstrapped` is set. This factory does not own bootstrap, name parsing,
 * or SystemRepo registration.
 *
 * 1. Bind baseClass and migratableDORepoConfig.
 * 2. Build initializeSchema for makeDORepo (runs on every activation).
 * 3. Ensure the applied_migrations ledger table exists.
 * 4. Read stamped migration ids from the ledger.
 * 5. Sort config migrations by id and drop already-stamped ones.
 * 6. Apply each pending migration (SQL + stamp in one transaction).
 * 7. Construct the DO class via makeDORepo with that initializeSchema.
 * 8. Expose migratableDORepoConfig alongside the inherited activation lifecycle.
 */
export function makeMigratableDORepo<
  const PATTERN extends string,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.DORepoNamespaces,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(props: {
  namespaceBinding: BINDING;
  baseClass?:
    | null
    | (new (
        ctx: DurableObjectState,
        env: Cloudflare.Env,
      ) => DurableObject<Cloudflare.Env> & Rpc.DurableObjectBranded);
  migratableDORepoConfig: IMigratableDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
}): {
  readonly getRepo: ReturnType<
    typeof makeDORepo<
      PATTERN,
      CONFIG,
      BINDING,
      SERVICES,
      GET_DB_CONFIG_ERROR,
      BOOTSTRAP_ERROR
    >
  >['getRepo'];
  readonly migratableDORepoConfig: IMigratableDORepoConfig<
    PATTERN,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  >;
  new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ): Rpc.DurableObjectBranded & {
    readonly ctx: DurableObjectState;
    readonly env: Cloudflare.Env;
    readonly name: string;
    readonly key: MatchParams<PATTERN>;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly relations: IDbConfigRelations<CONFIG>;
    readonly doRepoInitialization: Promise<void>;
    readonly alarmRegistry: IAlarmRegistry;
    alarm(): Promise<void>;
    onDOActivation(): Effect.Effect<
      void,
      IAnyError | IZerospinErrorJson,
      SERVICES | Async
    >;
    ready(): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    getRepoTableRows(props: {
      tableName: string;
    }): Promise<IRpcEnvelope<IRepoTableData, IZerospinErrorJson>>;
  };
} {
  // 1 — default baseClass to null; makeDORepo falls back to DurableObject
  const { baseClass = null, migratableDORepoConfig, namespaceBinding } = props;

  // 2 — initializeSchema is the migration hook makeDORepo runs every activation
  const initializeSchema = Effect.fn('MigratableDORepo.initializeSchema')(
    function* (props: { db: IDb<CONFIG> }) {
      const { db } = props;
      const { migrations } = migratableDORepoConfig;

      // 3 — CREATE TABLE IF NOT EXISTS applied_migrations; migratable-do-repo-ledger-failed
      yield* Effect.try({
        try: () => db.run(sql.raw(CREATE_APPLIED_MIGRATIONS_SQL)),
        catch: catchZerospinError({
          code: 'migratable-do-repo-ledger-failed',
          message: 'Failed to ensure applied_migrations ledger',
          preferCauseMessage: false,
        }),
      });

      // 4 — SELECT id FROM applied_migrations ORDER BY id ASC
      const appliedRows = db.all<{ id: number }>(
        sql.raw(`SELECT id FROM ${APPLIED_MIGRATIONS_TABLE} ORDER BY id ASC`),
      );
      const appliedIds = new Set(appliedRows.map(row => row.id));

      // 5 — pending = migrations sorted by id, minus stamped ids
      const pending = [...migrations]
        .sort((left, right) => left.id - right.id)
        .filter(migration => !appliedIds.has(migration.id));

      // 6 — applyMigratableDORepoMigration for each pending id
      for (const migration of pending) {
        yield* applyMigratableDORepoMigration({ db, migration });
      }
    },
  );

  // 7 — makeDORepo owns name/db/bootstrap/_isBootstrapped; we only inject initializeSchema
  const MigratableDORepoBase = makeDORepo({
    baseClass,
    namespaceBinding,
    ...migratableDORepoConfig,
    initializeSchema,
  });

  // 8 — retain static migratableDORepoConfig; startup and readiness belong to makeDORepo
  return class MigratableDORepo extends MigratableDORepoBase {
    static readonly migratableDORepoConfig = migratableDORepoConfig;
  };
}
