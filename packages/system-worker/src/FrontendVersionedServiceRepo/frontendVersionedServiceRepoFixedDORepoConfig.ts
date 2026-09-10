import { RoutePattern } from '@remix-run/route-pattern';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect } from 'effect';
import { system } from 'system';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { frontendVersionedServiceRepoTables } from './frontendVersionedServiceRepoDbConfig.js';

/** Name and fixed-schema metadata stay independent of the class and its VSC/FSC RPC dependencies. */
/*
 * FrontendVersionedServiceRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the bound service.
 * 2. Select the bound service snapshot.
 * 3. Build version-owned replica storage.
 */
export const frontendVersionedServiceRepoFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation: systemWorkerAbbreviations.frontendVersionedServiceRepo,
    repoType: 'FrontendVersionedServiceRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:serviceName/:serviceVersion/:userId/:frontendName',
    ),
    managedRuntime,
    dbConfig: Effect.fn('FrontendVersionedServiceRepo.dbConfig')(function* ({
      key,
    }) {
      // 1 — read system.services by key.serviceName
      const service = yield* getByKeyOrThrow({
        record: system.services,
        key: key.serviceName,
        recordKind: 'services',
      });

      // 2 — require authored support for key.serviceVersion
      const version = yield* getByKeyOrThrow({
        record: service,
        key: key.serviceVersion,
        recordKind: 'listed versions',
      });

      // 3 — supply the exact selected service model registry
      return makeResourceDbConfig({
        otherTables: frontendVersionedServiceRepoTables,
        models: version.models,
      });
    }),
  });
