import { RoutePattern } from '@remix-run/route-pattern';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { versionedServiceRepoTables } from './versionedServiceRepoDbConfig.js';

/**
 * Sibling of the VSR class module so ServiceAdmittedChain can import
 * `nameUtils` without loading `VersionedServiceRepo.ts` (cycle:
 * VSR → SAC → VSR).
 */
/*
 * VersionedServiceRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the service from the Repo key.
 * 2. Build owner resources and progress tables.
 */
export const versionedServiceRepoFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.versionedServiceRepo,
  repoType: 'VersionedServiceRepo',
  namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
  managedRuntime,
  dbConfig: Effect.fn('VersionedServiceRepo.dbConfig')(function* ({ key }) {
    // 1 — reject a serviceName absent from the authored System
    const service = system.services[key.serviceName]?.[key.serviceVersion];
    if (service === undefined) {
      return yield* new ZerospinError({
        code: 'service-service-not-found',
        message: `Service ${key.serviceName} was not found`,
      });
    }

    // 2 — supply exactly the service-owned models
    return makeResourceDbConfig({
      otherTables: versionedServiceRepoTables,
      models: service.models,
    });
  }),
});
