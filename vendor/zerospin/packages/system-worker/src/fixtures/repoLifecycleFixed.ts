import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { prettyUnknownFailure } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeTable,
  primitives,
} from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { getAgentAggregateIds } from '../SystemApi/agentSession.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

import { system } from './repoLifecycleConfig.js';

declare global {
  namespace Cloudflare {
    interface DORepoNamespaces {
      REPO_LIFECYCLE_AGGREGATE: {
        getByName(name: string): { fetch(request: Request): Promise<Response> };
      };
      REPO_LIFECYCLE_SERVICE: {
        getByName(name: string): { fetch(request: Request): Promise<Response> };
      };
      REPO_LIFECYCLE_CHAIN: {
        getByName(name: string): { fetch(request: Request): Promise<Response> };
      };
      REPO_LIFECYCLE_SYSTEM: {
        getByName(name: string): Pick<RepoLifecycleSystem, 'fetch'>;
      };
    }
  }
}

const calls = new Map<string, { dbConfig: number; bootstrap: number }>();
const dbConfig = makeDbConfig({
  tables: {
    records: makeTable({
      name: 'records',
      shape: { key: primitives.text(), value: primitives.text() },
      indexes: [{ name: 'records_key_unique', columns: ['key'], unique: true }],
    }),
  },
});

/** Adds failure injection and raw catalog inspection only to this disposable Worker. */
export class RepoLifecycleSystem extends SystemRepo {
  override fetch(request: Request) {
    const action = new URL(request.url).pathname.split('/')[2];
    if (action === 'fail-aggregate-write') {
      this.ctx.storage.sql.exec(
        "CREATE TRIGGER fail_aggregate_registration BEFORE INSERT ON aggregates WHEN NEW.aggregateId = 'acct_rollback' BEGIN SELECT RAISE(ABORT, 'injected aggregate registration failure'); END",
      );
    }
    if (action === 'allow-aggregate-write') {
      this.ctx.storage.sql.exec('DROP TRIGGER fail_aggregate_registration');
    }
    return Promise.resolve(
      Response.json({
        repos: this.ctx.storage.sql
          .exec('SELECT * FROM repos ORDER BY repoType, repoName')
          .toArray(),
        aggregates: this.ctx.storage.sql
          .exec('SELECT * FROM aggregates ORDER BY aggregateName, aggregateId')
          .toArray(),
      }),
    );
  }
}

/** Exercises AggregateChain identity registration through the real fixed factory. */
export class RepoLifecycleChain extends makeFixedDORepo({
  namespaceBinding: 'REPO_LIFECYCLE_CHAIN',
  fixedDORepoConfig: makeFixedDORepoConfig({
    abbreviation: 'ac',
    repoType: 'AggregateChain',
    namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
    managedRuntime: system.runtime,
    dbConfig,
  }),
}) {
  fetch(_request: Request) {
    return Promise.resolve(
      Response.json({
        bootstrapped: this.ctx.storage.kv.get('_isBootstrapped') ?? null,
      }),
    );
  }
}

/** The real fixed factory must obtain admission before provisioning or bootstrap. */
export class RepoLifecycleAggregate extends makeFixedDORepo({
  namespaceBinding: 'REPO_LIFECYCLE_AGGREGATE',
  fixedDORepoConfig: makeFixedDORepoConfig({
    abbreviation: 'avr',
    repoType: 'AggregateVersionRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
    ),
    managedRuntime: system.runtime,
    dbConfig: Effect.fn('RepoLifecycle.fixedDbConfig')(function* (props: {
      name: string;
    }) {
      const { name } = props;
      const current = calls.get(name) ?? { dbConfig: 0, bootstrap: 0 };
      current.dbConfig++;
      calls.set(name, current);
      return dbConfig;
    }),
    bootstrap: Effect.fn('RepoLifecycle.fixedBootstrap')(function* (props: {
      db: IDb<typeof dbConfig>;
      name: string;
    }) {
      const { db, name } = props;
      const current = calls.get(name) ?? { dbConfig: 0, bootstrap: 0 };
      current.bootstrap++;
      calls.set(name, current);
      db.insert(dbConfig.schema.records)
        .values({ key: 'bootstrap', value: 'once' })
        .run();
    }),
  }),
}) {
  fetch(_request: Request) {
    return Promise.resolve(
      Response.json({
        records: this.db.select().from(this.schema.records).all(),
        bootstrapped: this.ctx.storage.kv.get('_isBootstrapped') ?? null,
      }),
    );
  }
}

/** An unlisted service version must fail before resolving its database config. */
export class RepoLifecycleService extends makeFixedDORepo({
  namespaceBinding: 'REPO_LIFECYCLE_SERVICE',
  fixedDORepoConfig: makeFixedDORepoConfig({
    abbreviation: 'svr',
    repoType: 'ServiceVersionRepo',
    namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
    managedRuntime: system.runtime,
    dbConfig: Effect.fn('RepoLifecycle.serviceDbConfig')(function* (props: {
      name: string;
    }) {
      const { name } = props;
      const current = calls.get(name) ?? { dbConfig: 0, bootstrap: 0 };
      current.dbConfig++;
      calls.set(name, current);
      return dbConfig;
    }),
  }),
}) {
  fetch(_request: Request) {
    return Promise.resolve(
      Response.json({ unexpectedServiceActivation: true }),
    );
  }
}

export const repoLifecycleFixedWorker = {
  async fetch(request: Request, workerEnv: Cloudflare.Env) {
    const url = new URL(request.url);
    const [, action, name = 'lifecycle', version = '1.0.0'] =
      url.pathname.split('/');
    const systemRepo = workerEnv.SYSTEM_REPO.getByName(
      workerEnv.ZEROSPIN_SYSTEM_ID,
    );
    try {
      if (action === 'calls') return Response.json(Object.fromEntries(calls));
      if (action === 'accept') {
        return Response.json(
          await systemRepo.checkSystemSpec({
            spec: makeSystemSpec({ system }),
          }),
        );
      }
      if (action === 'system') {
        return Response.json({
          initialized: await systemRepo.initialize(),
          registrations: await systemRepo.getRepoRegistrations({
            repoType: 'SystemRepo',
          }),
          aggregateVersions: await systemRepo.getRepoRegistrations({
            repoType: 'AggregateVersionRepo',
          }),
          aggregateChains: await systemRepo.getRepoRegistrations({
            repoType: 'AggregateChain',
          }),
        });
      }
      if (action === 'registry') {
        return await workerEnv.REPO_LIFECYCLE_SYSTEM.getByName(
          workerEnv.ZEROSPIN_SYSTEM_ID,
        ).fetch(request);
      }
      if (action === 'catalog') {
        return Response.json({
          aggregateIds: await systemRepo.getAggregateIds({
            aggregateName: name,
          }),
          exists: await systemRepo.hasAggregate({
            aggregateName: name,
            aggregateId: Schema.decodeUnknownSync(
              makeAbbreviationIdSchema('acct'),
            )(version),
          }),
        });
      }
      if (action === 'agent-ids') {
        return Response.json(
          await system.runtime.runPromise(
            getAgentAggregateIds({
              request: {
                args: [{ aggregateName: name, aggregateVersion: version }],
                traceContext: null,
              },
              authResults: { systemId: workerEnv.ZEROSPIN_SYSTEM_ID },
            }).pipe(Effect.provide(AsyncLive)),
          ),
        );
      }
      if (action === 'chain' || action === 'register-chain') {
        const aggregateId = version;
        const repoName = system.runtime.runSync(
          RepoLifecycleChain.fixedDORepoConfig.nameUtils.makeName({
            systemId:
              url.searchParams.get('systemId') ?? workerEnv.ZEROSPIN_SYSTEM_ID,
            aggregateId,
            aggregateName: name,
          }),
        );
        if (action === 'register-chain') {
          return Response.json(
            await systemRepo.registerRepo({
              spec: makeSystemSpec({ system }),
              registration: {
                repoType: 'AggregateChain',
                repoName,
                tableNames: ['records'],
                aggregateName: name,
                aggregateId: Schema.decodeUnknownSync(
                  makeAbbreviationIdSchema('acct'),
                )(aggregateId),
              },
            }),
          );
        }
        return await workerEnv.REPO_LIFECYCLE_CHAIN.getByName(repoName).fetch(
          request,
        );
      }
      if (action === 'aggregate') {
        const repoName = system.runtime.runSync(
          RepoLifecycleAggregate.fixedDORepoConfig.nameUtils.makeName({
            systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
            aggregateId: 'agg_fixture',
            aggregateName: name,
            aggregateVersion: version,
          }),
        );
        return await workerEnv.REPO_LIFECYCLE_AGGREGATE.getByName(
          repoName,
        ).fetch(request);
      }
      if (action === 'service') {
        const repoName = system.runtime.runSync(
          RepoLifecycleService.fixedDORepoConfig.nameUtils.makeName({
            systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
            serviceName: name,
            serviceVersion: version,
          }),
        );
        return await workerEnv.REPO_LIFECYCLE_SERVICE.getByName(repoName).fetch(
          request,
        );
      }
      return Response.json({ failure: `Unknown lifecycle action ${action}` });
    } catch (failure) {
      return Response.json({ failure: prettyUnknownFailure(failure) });
    }
  },
};
