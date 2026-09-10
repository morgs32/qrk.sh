import { RoutePattern } from '@remix-run/route-pattern';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect } from 'effect';
import { system } from 'system';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { userVersionedAggregateRepoTables } from './userVersionedAggregateRepoDbConfig.js';

/** Name and fixed-schema metadata stay independent of the class and its VAC/UVAC RPC dependencies. */
/*
 * UserVersionedAggregateRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the bound aggregate.
 * 2. Select the bound aggregate snapshot.
 * 3. Build version-owned replica storage.
 */
export const userVersionedAggregateRepoFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation: systemWorkerAbbreviations.userVersionedAggregateRepo,
    repoType: 'UserVersionedAggregateRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:userId',
    ),
    managedRuntime,
    dbConfig: Effect.fn('UserVersionedAggregateRepo.dbConfig')(function* ({
      key,
    }) {
      // 1 — read system.aggregates by key.aggregateName
      const aggregate = yield* getByKeyOrThrow({
        record: system.aggregates,
        key: key.aggregateName,
        recordKind: 'aggregates',
      });

      // 2 — require authored support for key.aggregateVersion
      const version = yield* getByKeyOrThrow({
        record: aggregate,
        key: key.aggregateVersion,
        recordKind: 'listed versions',
      });

      // 3 — supply the exact selected aggregate model registry
      return makeResourceDbConfig({
        otherTables: userVersionedAggregateRepoTables,
        models: version.models,
      });
    }),
  });
