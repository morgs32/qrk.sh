import { RoutePattern } from '@remix-run/route-pattern';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IDb } from '@zerospin/core/drizzle/types';
import { prettyUnknownFailure } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { Effect, Layer, ManagedRuntime } from 'effect';

import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

declare global {
  namespace Cloudflare {
    interface DORepoNamespaces {
      REPO_LIFECYCLE_MIGRATABLE: {
        getByName(name: string): { fetch(request: Request): Promise<Response> };
      };
    }
    interface Env {
      LIFECYCLE_MIGRATION_MODE?: string;
    }
  }
}

const dbConfig = makeDbConfig({
  tables: {
    records: makeTable({
      name: 'records',
      shape: { key: primitives.text(), value: primitives.text() },
      indexes: [{ name: 'records_key_unique', columns: ['key'], unique: true }],
    }),
  },
});

/** This entry bundles without a config alias or any System Durable Object binding. */
export class RepoLifecycleMigratable extends makeMigratableDORepo({
  namespaceBinding: 'REPO_LIFECYCLE_MIGRATABLE',
  migratableDORepoConfig: makeMigratableDORepoConfig({
    namePattern: RoutePattern.parse('/:scenario'),
    managedRuntime: ManagedRuntime.make(Layer.empty),
    dbConfig,
    migrations: [
      {
        id: 1,
        name: 'initial records',
        sql: [
          'CREATE TABLE records (key TEXT NOT NULL UNIQUE, value TEXT NOT NULL)',
          "INSERT INTO records (key, value) VALUES ('migration', 'once')",
        ],
      },
      {
        id: 2,
        name: 'second migration',
        sql: [
          'CREATE TABLE second_migration (value TEXT NOT NULL)',
          "INSERT INTO second_migration (value) VALUES ('once')",
        ],
      },
      ...(env.LIFECYCLE_MIGRATION_MODE === 'base'
        ? []
        : [
            {
              id: 3,
              name: 'upgrade migration',
              sql: [
                'CREATE TABLE upgrade_migration (value TEXT NOT NULL)',
                env.LIFECYCLE_MIGRATION_MODE === 'failed'
                  ? 'INSERT INTO deliberately_missing_table VALUES (1)'
                  : "INSERT INTO upgrade_migration (value) VALUES ('once')",
              ],
            },
          ]),
    ],
    bootstrap: Effect.fn('RepoLifecycle.bootstrap')(function* (props: {
      db: IDb<typeof dbConfig>;
    }) {
      const { db } = props;
      db.insert(dbConfig.schema.records)
        .values({ key: 'bootstrap', value: 'once' })
        .run();
    }),
  }),
}) {
  fetch(request: Request) {
    if (new URL(request.url).pathname.endsWith('/store')) {
      this.db
        .insert(this.schema.records)
        .values({ key: 'saved', value: 'survives restart' })
        .onConflictDoUpdate({
          target: this.schema.records.key,
          set: { value: 'survives restart' },
        })
        .run();
    }
    return Promise.resolve(
      Response.json({
        records: this.db.select().from(this.schema.records).all(),
        migrations: this.ctx.storage.sql
          .exec(
            'SELECT id, name, appliedAt FROM applied_migrations ORDER BY id',
          )
          .toArray(),
        second: this.ctx.storage.sql
          .exec('SELECT * FROM second_migration')
          .toArray(),
        bootstrapped: this.ctx.storage.kv.get('_isBootstrapped') ?? null,
      }),
    );
  }
}

export const repoLifecycleStandaloneWorker = {
  async fetch(request: Request, workerEnv: Cloudflare.Env) {
    const scenario = new URL(request.url).pathname.split('/')[1] ?? 'main';
    try {
      return await workerEnv.REPO_LIFECYCLE_MIGRATABLE.getByName(
        scenario,
      ).fetch(request);
    } catch (failure) {
      return Response.json({ failure: prettyUnknownFailure(failure) });
    }
  },
};
